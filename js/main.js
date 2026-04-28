// ─── Alpine.js State Store ───────────────────────────────────────────────────
document.addEventListener('alpine:init', function() {
    Alpine.data('appState', function() {
        return {
            // 레이아웃
            sidebarOpen:     true,
            viewerOpen:      false,
            viewerNodeKey:   '',
            viewerNodeLabel: '',
            viewerContent:   '',
            viewerEditMode:  false,
            viewerEditContent: '',

            // 그래프 목록
            graphs:            [],
            currentGraphId:    null,
            currentGraphName:  '',
            newGraphName:      '',
            showNewGraphInput: false,

            // 수정 모드
            isEditMode:     false,
            connectingFrom: null,   // 엣지 연결 중인 소스 노드 ID
            inlineEditor: {
                visible: false,
                x: 0, y: 0,
                graphX: 0, graphY: 0,
                label: ''
            },

            // 검색
            searchQuery:   '',
            searchResults: [],

            // ─── 초기화 ──────────────────────────────────────────────────────

            init: async function() {
                window.appStateInstance = this;
                initCytoscape();

                this.$watch('isEditMode', (value) => {
                    document.body.classList.toggle('edit-mode', value);
                    this.cancelConnecting();
                    this.cancelInlineEditor();
                    if (value) {
                        this.viewerOpen = false;
                        setResetFocus(cy);
                        cy.autoungrabify(true);
                        cy.boxSelectionEnabled(false);
                    } else {
                        cy.autoungrabify(false);
                        cy.boxSelectionEnabled(true);
                        setResetFocus(cy);
                    }
                });

                this.$watch('viewerOpen', (value) => {
                    if (value && this.sidebarOpen) this.sidebarOpen = false;
                });

                await this.loadGraphs();
            },

            // ─── 그래프 관리 ─────────────────────────────────────────────────

            loadGraphs: async function() {
                const res = await fetch('/api/graphs');
                this.graphs = await res.json();
                if (this.graphs.length > 0) await this.switchGraph(this.graphs[0].id);
            },

            switchGraph: async function(graphId) {
                if (this.currentGraphId === graphId) return;
                this.currentGraphId   = graphId;
                this.currentGraphName = this.graphs.find(g => g.id === graphId)?.name || '';
                this.viewerOpen       = false;
                this.cancelConnecting();
                this.cancelInlineEditor();

                const elements = await fetch(`/api/graphs/${graphId}/elements`).then(r => r.json());
                cy.elements().remove();
                cy.add(elements);
                pageRank = cy.elements().pageRank();
                setResetFocus(cy);
                cy.layout({
                    name: 'cose-bilkent', animate: true, animationDuration: 500,
                    gravityRangeCompound: 1.5, fit: true, tile: true
                }).run();
            },

            showNewGraph: function() {
                this.showNewGraphInput = true;
                this.$nextTick(() => this.$refs.newGraphInput?.focus());
            },

            cancelNewGraph: function() {
                this.showNewGraphInput = false;
                this.newGraphName = '';
            },

            createGraph: async function() {
                const name = this.newGraphName.trim();
                if (!name) return;
                const graph = await fetch('/api/graphs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                }).then(r => r.json());
                this.graphs.push(graph);
                this.cancelNewGraph();
                await this.switchGraph(graph.id);
            },

            deleteGraph: async function(graphId) {
                if (!confirm('그래프를 삭제하시겠습니까?')) return;
                await fetch(`/api/graphs/${graphId}`, { method: 'DELETE' });
                this.graphs = this.graphs.filter(g => g.id !== graphId);
                if (this.currentGraphId === graphId) {
                    if (this.graphs.length > 0) await this.switchGraph(this.graphs[0].id);
                    else { cy.elements().remove(); this.currentGraphId = null; this.currentGraphName = ''; }
                }
            },

            // ─── 마크다운 뷰어 ───────────────────────────────────────────────

            openViewer: function(node) {
                const isSameNode = this.viewerNodeKey === node.id() && this.viewerOpen;
                this.viewerNodeKey    = node.id();
                this.viewerNodeLabel  = node.data('label') || node.id();
                this.viewerContent    = node.data('content') || '';
                this.viewerEditContent = this.viewerContent;
                if (!isSameNode) this.viewerEditMode = false;
                this.viewerOpen = true;
            },

            toggleViewerEdit: function() {
                if (this.viewerEditMode) {
                    // 편집 → 미리보기: 변경 내용 유지
                    this.viewerContent = this.viewerEditContent;
                }
                this.viewerEditMode = !this.viewerEditMode;
                if (this.viewerEditMode) {
                    this.$nextTick(() => this.$refs.markdownTextarea?.focus());
                }
            },

            saveViewerContent: async function() {
                const content = this.viewerEditContent;
                try {
                    await fetch(`/api/nodes/${this.currentGraphId}/${this.viewerNodeKey}/content`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    });
                    this.viewerContent = content;
                    cy.getElementById(this.viewerNodeKey).data('content', content);
                    this.viewerEditMode = false;
                } catch(e) {
                    console.error(e);
                    alert('저장 중 오류가 발생했습니다.');
                }
            },

            renderMarkdown: function(content) {
                return typeof marked !== 'undefined' ? marked.parse(content || '') : (content || '');
            },

            // ─── 인라인 노드 편집기 ──────────────────────────────────────────

            showInlineEditor: function(rendX, rendY, graphX, graphY) {
                var prev = cy.getElementById('__pending__');
                if (prev.length > 0) prev.remove();

                cy.add({
                    group: 'nodes',
                    data: { id: '__pending__', label: '+' },
                    position: { x: graphX, y: graphY },
                    classes: 'pending-node'
                });

                // 에디터가 캔버스 밖으로 잘리지 않도록 위치 보정
                var cyEl = document.getElementById('cy');
                var edW = 192, edH = 120, gap = 14;
                var x = Math.max(edW / 2, Math.min(rendX, cyEl.offsetWidth  - edW / 2));
                var y = Math.max(edH + gap, Math.min(rendY, cyEl.offsetHeight - 20));

                this.inlineEditor = { visible: true, x: x, y: y, graphX: graphX, graphY: graphY, label: '' };
                this.$nextTick(() => this.$refs.inlineEditorInput?.focus());
            },

            confirmInlineEditor: async function() {
                const label = this.inlineEditor.label.trim();
                if (!label) { this.cancelInlineEditor(); return; }

                const id = this.labelToId(label);
                cy.getElementById('__pending__').remove();
                this.inlineEditor.visible = false;

                const element = {
                    group: 'nodes',
                    data: { id, label, url: '', content: '' }
                };
                try {
                    const res = await fetch(`/api/graphs/${this.currentGraphId}/elements`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ elements: [element] })
                    });
                    if (!res.ok) throw new Error();
                    cy.add({ ...element, position: { x: this.inlineEditor.graphX, y: this.inlineEditor.graphY } });
                    pageRank = cy.elements().pageRank();
                    setResetFocus(cy);
                    const graph = this.graphs.find(g => g.id === this.currentGraphId);
                    if (graph) graph.nodeCount++;
                } catch(e) {
                    console.error(e);
                    alert('노드 저장 중 오류가 발생했습니다.');
                }
                this.inlineEditor.label = '';
            },

            cancelInlineEditor: function() {
                if (this.inlineEditor.visible) {
                    cy.getElementById('__pending__').remove();
                    this.inlineEditor.visible = false;
                    this.inlineEditor.label = '';
                }
            },

            labelToId: function(label) {
                var base = label.trim()
                    .toUpperCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^A-Z0-9가-힣\-]/g, '')
                    || 'NODE';
                var id = base, i = 2;
                while (cy.getElementById(id).length > 0) id = base + '-' + i++;
                return id;
            },

            // ─── 엣지 연결 ───────────────────────────────────────────────────

            createEdge: async function(sourceId, targetId) {
                cy.getElementById(sourceId).removeClass('connecting-source');
                this.connectingFrom = null;

                const edgeId = sourceId + '-' + targetId;
                if (cy.getElementById(edgeId).length > 0) return;

                const element = {
                    group: 'edges',
                    data: { id: edgeId, source: sourceId, target: targetId }
                };
                try {
                    await fetch(`/api/graphs/${this.currentGraphId}/elements`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ elements: [element] })
                    });
                    cy.add(element);
                } catch(e) {
                    console.error(e);
                }
            },

            cancelConnecting: function() {
                if (this.connectingFrom) {
                    cy.getElementById(this.connectingFrom).removeClass('connecting-source');
                    this.connectingFrom = null;
                }
            },

            // ─── 노드 클릭 핸들러 ────────────────────────────────────────────

            handleNodeClick: function(node) {
                // __pending__ 노드는 클릭 무시
                if (node.id() === '__pending__') return;
                this.cancelInlineEditor();

                if (!this.isEditMode) {
                    gtag('event', 'Click', { 'event_category': 'node', 'event_label': node.id(), 'value': 1 });
                    this.openViewer(node);
                    return;
                }

                // 수정 모드: 클릭-클릭 엣지 생성
                const nodeId = node.id();
                if (this.connectingFrom === null) {
                    this.connectingFrom = nodeId;
                    cy.getElementById(nodeId).addClass('connecting-source');
                } else if (this.connectingFrom === nodeId) {
                    this.cancelConnecting();
                } else {
                    this.createEdge(this.connectingFrom, nodeId);
                }
            },

            // ─── 검색 ────────────────────────────────────────────────────────

            handleSearch: function() {
                var query = this.searchQuery.trim().toLowerCase();
                if (!query) { this.searchResults = []; return; }
                if (!cy) return;
                this.searchResults = cy.nodes()
                    .filter(function(node) {
                        if (node.id() === '__pending__') return false;
                        var label = (node.data('label') || '').toLowerCase();
                        return label.includes(query) || node.id().toLowerCase().includes(query);
                    })
                    .slice(0, 20)
                    .map(function(node) {
                        return { id: node.id(), label: node.data('label') || node.id() };
                    });
            },

            selectSearchResult: function(nodeData) {
                this.searchQuery   = '';
                this.searchResults = [];
                var cyNode = cy.getElementById(nodeData.id);
                if (!cyNode || cyNode.length === 0) return;
                cy.batch(function() {
                    setResetFocus(cy);
                    setStyle(cy, {
                        'background-color': dimColor, 'line-color': dimColor,
                        'target-arrow-color': dimColor, 'color': dimColor
                    });
                    setFocus(cyNode, successorColor, predecessorsColor, edgeActiveWidth, arrowActiveScale);
                });
                cy.animate({ center: { eles: cyNode } }, { duration: 500 });
            }
        };
    });
});

// ─── Cytoscape 전역 변수 ──────────────────────────────────────────────────────
var dimColor         = '#f4f4f8';
var textOutlineColor = 'white';
var fontColor        = 'black';
var nodeBGColor      = '#4f5b66';
var edgeBGColor      = '#c0c5ce';
var edgeWidth        = '0.3px';
var arrowScale       = 0.2;
var arrowActiveScale = 0.5;
var successorColor   = 'rgb(246, 176, 172)';
var predecessorsColor = 'rgb(140, 232, 250)';
var nodeActiveBGColor = '#fed766';
var nodeActiveSize    = 23;
var nodeActiveFontSize = 7;
var edgeActiveWidth  = '1px';
var pageRank;
var nodeMaxSize = 80;
var nodeMinSize = 4;
var fontMaxSize = 7;
var fontMinSize = 4;
var cy;

function getRank(ele) {
    try {
        var r = pageRank.rank('#' + ele.id());
        if (r !== undefined && r !== null) return typeof r === 'number' ? r : (r[0] || 0);
    } catch(e) {}
    return 0;
}

function setStyle(target_cy, style) {
    target_cy.batch(function() {
        target_cy.nodes().forEach(function(t) { t.style(style); });
        target_cy.edges().forEach(function(t) { t.style(style); });
    });
}

function setResetFocus(target_cy) {
    target_cy.batch(function() {
        target_cy.nodes().forEach(function(target) {
            if (target.id() === '__pending__') return;
            var rank = getRank(target);
            target.style('background-color', nodeBGColor);
            target.style('width',     nodeMaxSize * rank + nodeMinSize);
            target.style('height',    nodeMaxSize * rank + nodeMinSize);
            target.style('font-size', fontMaxSize * rank + fontMinSize);
            target.style('color', fontColor);
        });
        target_cy.edges().forEach(function(target) {
            target.style('line-color',         edgeBGColor);
            target.style('target-arrow-color', edgeBGColor);
            target.style('width',              edgeWidth);
            target.style('arrow-scale',        arrowScale);
        });
    });
}

function setFocus(target_element, successorsColor, predecessorsColor, edgeWidth, arrowScale) {
    cy.batch(function() {
        target_element.style('background-color', nodeActiveBGColor);
        target_element.style('color', fontColor);
        target_element.successors().each(function(e) {
            if (e.isEdge()) { e.style('width', edgeWidth); e.style('arrow-scale', arrowScale); }
            e.style('color', fontColor);
            e.style('background-color',   successorsColor);
            e.style('line-color',         successorsColor);
            e.style('target-arrow-color', successorsColor);
            e.style('z-index', getMaxZIndex());
            e.style('opacity', 1);
        });
        target_element.predecessors().each(function(e) {
            if (e.isEdge()) { e.style('width', edgeWidth); e.style('arrow-scale', arrowScale); }
            e.style('color', fontColor);
            e.style('background-color',   predecessorsColor);
            e.style('line-color',         predecessorsColor);
            e.style('target-arrow-color', predecessorsColor);
            e.style('z-index', getMaxZIndex());
            e.style('opacity', 1);
        });
        target_element.neighborhood().each(function(e) {
            var d = 30;
            e.style('background-color',   tinycolor(e.style('background-color')).darken(d).toString());
            e.style('line-color',         tinycolor(e.style('line-color')).darken(d).toString());
            e.style('target-arrow-color', tinycolor(e.style('target-arrow-color')).darken(d).toString());
        });
        target_element.style('z-index',   getMaxZIndex());
        target_element.style('width',     Math.max(parseFloat(target_element.style('width')),     nodeActiveSize));
        target_element.style('height',    Math.max(parseFloat(target_element.style('height')),    nodeActiveSize));
        target_element.style('font-size', Math.max(parseFloat(target_element.style('font-size')), nodeActiveFontSize));
    });
}

function getMaxZIndex() {
    if (!window.zindex) window.zindex = 1;
    return ++window.zindex;
}

// ─── Cytoscape 초기화 ─────────────────────────────────────────────────────────
function initCytoscape() {
    cy = cytoscape({
        container: document.getElementById('cy'),
        elements:  [],
        minZoom:   0.2,
        wheelSensitivity: 0.1,
        autounselectify:  true,
        boxSelectionEnabled: false,
        style: [
            {
                selector: 'node',
                style: {
                    'font-family':        'Open Sans Condensed',
                    'font-weight':        '200',
                    'label':              'data(label)',
                    'text-valign':        'top',
                    'color':              fontColor,
                    'text-outline-width': 0,
                    'text-outline-color': textOutlineColor,
                    'background-color':   nodeBGColor,
                    'width':     function(ele) { return nodeMaxSize * getRank(ele) + nodeMinSize; },
                    'height':    function(ele) { return nodeMaxSize * getRank(ele) + nodeMinSize; },
                    'font-size': function(ele) { return fontMaxSize * getRank(ele) + fontMinSize; }
                }
            },
            {
                selector: 'edge',
                style: {
                    'curve-style':        'bezier',
                    'width':              0.3,
                    'target-arrow-shape': 'triangle',
                    'line-color':         edgeBGColor,
                    'target-arrow-color': edgeBGColor,
                    'arrow-scale':        arrowScale
                }
            },
            { selector: '.prepare',          style: { 'opacity': '0.5' } },
            { selector: '.connecting-source', style: {
                'border-width':   3,
                'border-color':   '#fed766',
                'border-opacity': 1
            }},
            { selector: '.pending-node', style: {
                'background-color': '#fed766',
                'border-width':     0,
                'width':            16,
                'height':           16,
                'opacity':          1,
                'font-size':        8,
                'color':            '#4f5b66',
                'label':            '+'
            }}
        ],
        layout: { name: 'preset' }
    });

    // 수동 더블탭 감지용 상태 (dbltap 이벤트보다 신뢰성이 높음)
    var _bgTap = { time: 0, x: 0, y: 0 };

    cy.on('tap', 'node', function(e) {
        _bgTap = { time: 0, x: 0, y: 0 }; // 노드 탭 시 더블탭 타이머 리셋
        if (window.appStateInstance) window.appStateInstance.handleNodeClick(e.target);
    });

    cy.on('tap', function(e) {
        if (e.cy !== e.target) return;
        var inst = window.appStateInstance;
        if (!inst) return;

        if (!inst.isEditMode) {
            setResetFocus(e.cy);
            _bgTap = { time: 0, x: 0, y: 0 };
            return;
        }

        // 수정 모드: 수동 더블탭 감지
        var now = Date.now();
        var rp  = e.renderedPosition;
        var dx  = rp.x - _bgTap.x;
        var dy  = rp.y - _bgTap.y;

        if (now - _bgTap.time < 350 && Math.sqrt(dx * dx + dy * dy) < 25) {
            // 더블탭 → 인라인 에디터 표시
            _bgTap = { time: 0, x: 0, y: 0 };
            inst.showInlineEditor(rp.x, rp.y, e.position.x, e.position.y);
        } else {
            // 싱글탭 → 연결/에디터 취소
            inst.cancelConnecting();
            inst.cancelInlineEditor();
            _bgTap = { time: now, x: rp.x, y: rp.y };
        }
    });

    cy.on('tapend mouseout', 'node', function(e) {
        if (window.appStateInstance && window.appStateInstance.isEditMode) return;
        setResetFocus(e.cy);
    });

    cy.on('tapstart mouseover', 'node', function(e) {
        if (window.appStateInstance && window.appStateInstance.isEditMode) return;
        setResetFocus(e.cy);
        setStyle(cy, {
            'background-color': dimColor, 'line-color': dimColor,
            'target-arrow-color': dimColor, 'color': dimColor
        });
        setFocus(e.target, successorColor, predecessorsColor, edgeActiveWidth, arrowActiveScale);
    });

    new ResizeObserver(function() { cy.resize(); }).observe(document.getElementById('cy'));
    waitForWebfonts(['Open Sans Condensed'], function() { cy.forceRender(); });
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function debouncer(func, timeout) {
    var timeoutID, timeout = timeout || 200;
    return function() {
        var scope = this, args = arguments;
        clearTimeout(timeoutID);
        timeoutID = setTimeout(function() { func.apply(scope, Array.prototype.slice.call(args)); }, timeout);
    };
}

function waitForWebfonts(fonts, callback) {
    var loadedFonts = 0;
    for (var i = 0, l = fonts.length; i < l; ++i) {
        (function(font) {
            var node = document.createElement('span');
            node.innerHTML = 'giItT1WQy@!-/#';
            node.style.position    = 'absolute';
            node.style.left        = '-10000px';
            node.style.top         = '-10000px';
            node.style.fontSize    = '300px';
            node.style.fontFamily  = 'sans-serif';
            node.style.fontVariant = 'normal';
            node.style.fontStyle   = 'normal';
            node.style.fontWeight  = 'normal';
            node.style.letterSpacing = '0';
            document.body.appendChild(node);
            var width = node.offsetWidth;
            node.style.fontFamily = font + ', sans-serif';
            var interval;
            function checkFont() {
                if (node && node.offsetWidth != width) {
                    ++loadedFonts; node.parentNode.removeChild(node); node = null;
                }
                if (loadedFonts >= fonts.length) {
                    if (interval) clearInterval(interval);
                    if (loadedFonts == fonts.length) { callback(); return true; }
                }
            }
            if (!checkFont()) interval = setInterval(checkFont, 50);
        })(fonts[i]);
    }
}

window.addEventListener('resize', debouncer(function() { if (cy) cy.fit(); }));

(function() {
    var handled = false;
    function enablePanning() {
        if (handled) return;
        handled = true;
        cy.userPanningEnabled(true);
    }
    document.addEventListener('touchstart', enablePanning, { once: true });
    document.addEventListener('click',      enablePanning, { once: true });
})();
