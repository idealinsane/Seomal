// ─── Alpine.js State Store ───────────────────────────────────────────────────
document.addEventListener('alpine:init', function() {
    Alpine.data('appState', function() {
        return {
            // 레이아웃
            sidebarOpen:    false,
            viewerOpen:     false,
            viewerNodeLabel: '',
            viewerContent:  '',

            // 그래프 목록
            graphs:           [],
            currentGraphId:   null,
            currentGraphName: '',
            newGraphName:     '',
            showNewGraphInput: false,

            // 수정 모드
            isEditMode:      false,
            clickMode:       'none',
            newNode:         { id: '', label: '', url: '' },
            selectedTargets: [],
            selectedSources: [],

            // 검색
            searchQuery:   '',
            searchResults: [],

            // ─── 초기화 ────────────────────────────────────────────────────

            init: async function() {
                window.appStateInstance = this;
                initCytoscape();

                this.$watch('isEditMode', (value) => {
                    if (value) {
                        this.viewerOpen = false;
                        setResetFocus(cy);
                        cy.autoungrabify(true);
                        cy.boxSelectionEnabled(false);
                        this.updateGraphSelectionStyles();
                    } else {
                        this.selectedTargets = [];
                        this.selectedSources = [];
                        this.updateGraphSelectionStyles();
                        cy.autoungrabify(false);
                        cy.boxSelectionEnabled(true);
                    }
                });

                // A안: 뷰어 열릴 때 사이드바 자동 닫기
                this.$watch('viewerOpen', (value) => {
                    if (value && this.sidebarOpen) this.sidebarOpen = false;
                });

                await this.loadGraphs();
            },

            // ─── 그래프 관리 ───────────────────────────────────────────────

            loadGraphs: async function() {
                const res = await fetch('/api/graphs');
                this.graphs = await res.json();
                if (this.graphs.length > 0) await this.switchGraph(this.graphs[0].id);
            },

            switchGraph: async function(graphId) {
                if (this.currentGraphId === graphId) { this.sidebarOpen = false; return; }
                this.currentGraphId   = graphId;
                this.currentGraphName = this.graphs.find(g => g.id === graphId)?.name || '';
                this.viewerOpen       = false;
                this.sidebarOpen      = false;

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

            // ─── 마크다운 뷰어 ─────────────────────────────────────────────

            renderMarkdown: function(content) {
                return typeof marked !== 'undefined' ? marked.parse(content || '') : (content || '');
            },

            // ─── 검색 ──────────────────────────────────────────────────────

            handleSearch: function() {
                var query = this.searchQuery.trim().toLowerCase();
                if (!query) { this.searchResults = []; return; }
                if (!cy) return;
                this.searchResults = cy.nodes()
                    .filter(function(node) {
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
            },

            // ─── 노드 클릭 ─────────────────────────────────────────────────

            handleNodeClick: function(node) {
                if (!this.isEditMode) {
                    var content = node.data('content') || '';
                    var url     = node.data('url')     || '';
                    gtag('event', 'Click', { 'event_category': 'node', 'event_label': node.id(), 'value': 1 });
                    if (content.trim()) {
                        this.viewerNodeLabel = node.data('label') || node.id();
                        this.viewerContent   = content;
                        this.viewerOpen      = true;
                    } else if (url) {
                        window.open(url);
                    }
                    return;
                }

                var nodeId    = node.id();
                var nodeLabel = node.data('label') || nodeId;
                if (this.clickMode === 'target') {
                    var existsT = this.selectedTargets.find(function(t) { return t.id === nodeId; });
                    if (existsT) this.selectedTargets = this.selectedTargets.filter(function(t) { return t.id !== nodeId; });
                    else         this.selectedTargets.push({ id: nodeId, label: nodeLabel });
                } else if (this.clickMode === 'source') {
                    var existsS = this.selectedSources.find(function(s) { return s.id === nodeId; });
                    if (existsS) this.selectedSources = this.selectedSources.filter(function(s) { return s.id !== nodeId; });
                    else         this.selectedSources.push({ id: nodeId, label: nodeLabel });
                }
                this.updateGraphSelectionStyles();
            },

            removeTarget: function(id) {
                this.selectedTargets = this.selectedTargets.filter(function(t) { return t.id !== id; });
                this.updateGraphSelectionStyles();
            },

            removeSource: function(id) {
                this.selectedSources = this.selectedSources.filter(function(s) { return s.id !== id; });
                this.updateGraphSelectionStyles();
            },

            updateGraphSelectionStyles: function() {
                cy.nodes().removeClass('selected-target selected-source');
                this.selectedTargets.forEach(function(t) { cy.getElementById(t.id).addClass('selected-target'); });
                this.selectedSources.forEach(function(s) { cy.getElementById(s.id).addClass('selected-source'); });
            },

            addNode: async function() {
                var idInput    = this.newNode.id.trim();
                var labelInput = this.newNode.label.trim();
                var urlInput   = this.newNode.url.trim();
                if (!idInput) { alert('노드 ID를 입력해주세요.'); return; }
                if (cy.getElementById(idInput).length > 0) { alert('이미 존재하는 ID입니다.'); return; }

                var elementsToAdd = [{
                    group: 'nodes',
                    data:  { id: idInput, label: labelInput || idInput, url: urlInput, content: '' }
                }];
                this.selectedTargets.forEach(function(t) {
                    elementsToAdd.push({ group: 'edges', data: { id: t.id + '-' + idInput, source: t.id, target: idInput } });
                });
                this.selectedSources.forEach(function(s) {
                    elementsToAdd.push({ group: 'edges', data: { id: idInput + '-' + s.id, source: idInput, target: s.id } });
                });

                try {
                    const res = await fetch(`/api/graphs/${this.currentGraphId}/elements`, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({ elements: elementsToAdd })
                    });
                    if (!res.ok) throw new Error('Server error');

                    cy.add(elementsToAdd);
                    pageRank = cy.elements().pageRank();
                    setResetFocus(cy);
                    cy.layout({
                        name: 'cose-bilkent', animate: true, animationDuration: 500,
                        gravityRangeCompound: 1.5, fit: true, tile: true
                    }).run();

                    const graph = this.graphs.find(g => g.id === this.currentGraphId);
                    if (graph) graph.nodeCount++;

                    this.newNode         = { id: '', label: '', url: '' };
                    this.selectedTargets = [];
                    this.selectedSources = [];
                    this.updateGraphSelectionStyles();
                    alert('노드가 성공적으로 추가되었습니다!');
                } catch(e) {
                    console.error(e);
                    alert('저장 중 오류가 발생했습니다.');
                }
            }
        };
    });
});

// ─── Cytoscape 전역 변수 ──────────────────────────────────────────────────────
var dimColor        = '#f4f4f8';
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
            var rank = getRank(target);
            target.style('background-color', nodeBGColor);
            target.style('width',     nodeMaxSize * rank + nodeMinSize);
            target.style('height',    nodeMaxSize * rank + nodeMinSize);
            target.style('font-size', fontMaxSize * rank + fontMinSize);
            target.style('color', fontColor);
        });
        target_cy.edges().forEach(function(target) {
            target.style('line-color',          edgeBGColor);
            target.style('target-arrow-color',  edgeBGColor);
            target.style('width',               edgeWidth);
            target.style('arrow-scale',         arrowScale);
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
            e.style('background-color',    successorsColor);
            e.style('line-color',          successorsColor);
            e.style('target-arrow-color',  successorsColor);
            e.style('z-index', getMaxZIndex());
            e.style('opacity', 1);
        });
        target_element.predecessors().each(function(e) {
            if (e.isEdge()) { e.style('width', edgeWidth); e.style('arrow-scale', arrowScale); }
            e.style('color', fontColor);
            e.style('background-color',    predecessorsColor);
            e.style('line-color',          predecessorsColor);
            e.style('target-arrow-color',  predecessorsColor);
            e.style('z-index', getMaxZIndex());
            e.style('opacity', 1);
        });
        target_element.neighborhood().each(function(e) {
            var d = 30;
            e.style('background-color',   tinycolor(e.style('background-color')).darken(d).toString());
            e.style('line-color',         tinycolor(e.style('line-color')).darken(d).toString());
            e.style('target-arrow-color', tinycolor(e.style('target-arrow-color')).darken(d).toString());
        });
        target_element.style('z-index',    getMaxZIndex());
        target_element.style('width',      Math.max(parseFloat(target_element.style('width')),     nodeActiveSize));
        target_element.style('height',     Math.max(parseFloat(target_element.style('height')),    nodeActiveSize));
        target_element.style('font-size',  Math.max(parseFloat(target_element.style('font-size')), nodeActiveFontSize));
    });
}

function getMaxZIndex() {
    if (!window.zindex) window.zindex = 1;
    return ++window.zindex;
}

// ─── Cytoscape 초기화 (Alpine init에서 호출) ──────────────────────────────────
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
                    'font-family':       'Open Sans Condensed',
                    'font-weight':       '200',
                    'label':             'data(label)',
                    'text-valign':       'top',
                    'color':             fontColor,
                    'text-outline-width': 0,
                    'text-outline-color': textOutlineColor,
                    'background-color':  nodeBGColor,
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
                    'target-arrow-color': edgeBGColor
                }
            },
            { selector: '.prepare',         style: { 'opacity': '0.5' } },
            { selector: '.selected-target', style: { 'border-width': 4, 'border-color': '#4a91f2' } },
            { selector: '.selected-source', style: { 'border-width': 4, 'border-color': '#ff8b94' } }
        ],
        layout: { name: 'preset' }
    });

    // 이벤트 바인딩
    cy.on('tap', 'node', function(e) {
        if (window.appStateInstance) window.appStateInstance.handleNodeClick(e.target);
    });
    cy.on('tap', function(e) {
        if (e.cy === e.target && window.appStateInstance && !window.appStateInstance.isEditMode)
            setResetFocus(e.cy);
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

    // 컨테이너 크기 변경 시 자동 리사이즈
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
                    ++loadedFonts;
                    node.parentNode.removeChild(node);
                    node = null;
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
