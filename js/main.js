    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    function getFetchURL() {
        return 'data/' + (getParameterByName('src') ? getParameterByName('src') + '.json' : 'data.json');
    }

    // Alpine.js State Store
    document.addEventListener('alpine:init', function() {
        Alpine.data('appState', function() {
            return {
                isEditMode: false,
                clickMode: 'none',
                searchQuery: '',
                searchResults: [],
                newNode: {
                    id: '',
                    label: '',
                    url: ''
                },
                selectedTargets: [], // Array of {id, label}
                selectedSources: [], // Array of {id, label}
                
                init: function() {
                    // Alpine.js가 초기화될 때 전역 객체에 appState 인스턴스를 노출합니다.
                    window.appStateInstance = this;
                },

                toggleEditMode: function() {
                    if (this.isEditMode) {
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
                },

                handleSearch: function() {
                    var query = this.searchQuery.trim().toLowerCase();
                    if (!query) {
                        this.searchResults = [];
                        return;
                    }

                    if (!cy) return; // cy가 아직 초기화되지 않았을 경우 방어

                    this.searchResults = cy.nodes().filter(function(node) {
                        var label = (node.data('label') || '').toLowerCase();
                        var id = node.id().toLowerCase();
                        return label.includes(query) || id.includes(query);
                    }).map(function(node) {
                        return {
                            id: node.id(),
                            label: node.data('label') || node.id(),
                            cyNode: node
                        };
                    });
                },

                selectSearchResult: function(nodeData) {
                    this.searchQuery = '';
                    this.searchResults = [];
                    
                    cy.batch(function() {
                        setResetFocus(cy);
                        setStyle(cy, {
                            'background-color': dimColor,
                            'line-color': dimColor,
                            'target-arrow-color': dimColor,
                            'color': dimColor
                        });
                        setFocus(nodeData.cyNode, successorColor, predecessorsColor, edgeActiveWidth, arrowActiveScale);
                    });
                    
                    cy.animate({
                        center: { eles: nodeData.cyNode }
                    }, { duration: 500 });
                },

                handleNodeClick: function(node) {
                    if (!this.isEditMode) {
                        var url = node.data('url');
                        gtag('event', 'Click', {
                            'event_category': 'node',
                            'event_label': node.id(),
                            'value': 1
                        });
                        if(url && url !== '') window.open(url);
                        return;
                    }

                    var nodeId = node.id();
                    var nodeLabel = node.data('label') || nodeId;

                    if (this.clickMode === 'target') {
                        var existsT = this.selectedTargets.find(function(t) { return t.id === nodeId; });
                        if (existsT) this.selectedTargets = this.selectedTargets.filter(function(t) { return t.id !== nodeId; });
                        else this.selectedTargets.push({ id: nodeId, label: nodeLabel });
                    } else if (this.clickMode === 'source') {
                        var existsS = this.selectedSources.find(function(s) { return s.id === nodeId; });
                        if (existsS) this.selectedSources = this.selectedSources.filter(function(s) { return s.id !== nodeId; });
                        else this.selectedSources.push({ id: nodeId, label: nodeLabel });
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

                addNode: function() {
                    var idInput = this.newNode.id.trim();
                    var labelInput = this.newNode.label.trim();
                    var urlInput = this.newNode.url.trim();

                    if (!idInput) {
                        alert('노드 ID를 입력해주세요.');
                        return;
                    }

                    if (cy.getElementById(idInput).length > 0) {
                        alert('이미 존재하는 ID입니다. 다른 ID를 사용해주세요.');
                        return;
                    }

                    var elementsToAdd = [];
                    elementsToAdd.push({
                        group: 'nodes',
                        data: {
                            id: idInput,
                            label: labelInput || idInput,
                            url: urlInput
                        }
                    });

                    this.selectedTargets.forEach(function(t) {
                        elementsToAdd.push({
                            group: 'edges',
                            data: { id: t.id + '-' + idInput, source: t.id, target: idInput }
                        });
                    });

                    this.selectedSources.forEach(function(s) {
                        elementsToAdd.push({
                            group: 'edges',
                            data: { id: idInput + '-' + s.id, source: idInput, target: s.id }
                        });
                    });

                    var srcParam = getParameterByName('src');
                    var payload = { src: srcParam || 'data', elements: elementsToAdd };

                    var self = this;

                    fetch('/api/add-elements', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                    .then(function(response) {
                        if (!response.ok) throw new Error('Network response was not ok');
                        return response.json();
                    })
                    .then(function(data) {
                        console.log('Server response:', data);
                        cy.add(elementsToAdd);
                        pageRank = cy.elements().pageRank();
                        setResetFocus(cy);
                        cy.layout({
                            name: 'cose-bilkent', animate: true, animationDuration: 500,
                            gravityRangeCompound: 1.5, fit: true, tile: true
                        }).run();

                        self.newNode = { id: '', label: '', url: '' };
                        self.selectedTargets = [];
                        self.selectedSources = [];
                        self.updateGraphSelectionStyles();
                        
                        alert('노드가 성공적으로 추가되고 파일에 저장되었습니다!');
                    })
                    .catch(function(error) {
                        console.error('Error saving elements:', error);
                        alert('서버 저장 중 오류가 발생했습니다. 개발자 도구 콘솔을 확인해주세요.');
                    });
                }
            };
        });
    });

    // Global variables for Cytoscape styling
    var dimColor = '#f4f4f8';
    var textOutlineColor = 'white';
    var fontColor = 'black';
    var nodeBGColor = '#4f5b66';
    var edgeBGColor = '#c0c5ce';
    var edgeWidth = '0.3px';
    var arrowScale = 0.2;
    var arrowActiveScale = 0.5;
    var successorColor = 'rgb(246, 176, 172)';
    var successorWeakColor = '#ff8b94';
    var predecessorsColor = 'rgb(140, 232, 250)';
    var predecessorsWeakColor = '#4a91f2';
    var nodeActiveBGColor = '#fed766';
    var nodeActiveSize = 23;
    var nodeActiveFontSize = 7;
    var edgeActiveWidth = '1px';
    var pageRank;
    var nodeMaxSize = 80;
    var nodeMinSize = 4;
    var fontMaxSize = 7;
    var fontMinSize = 4;
    var cy;

    function setOpacityElement(target_element, degree){
        target_element.style('opacity', degree);
    }

    function setStyle(target_cy, style){
        target_cy.batch(function() {
            target_cy.nodes().forEach(function(target){
                target.style(style);
            });
            target_cy.edges().forEach(function(target){
                target.style(style);
            });
        });
    }

    function setResetFocus(target_cy){
        target_cy.batch(function() {
            target_cy.nodes().forEach(function(target){
                target.style('background-color', nodeBGColor);
                var rank = 0;
                try {
                    var rankObj = pageRank.rank('#' + target.id());
                    if (rankObj !== undefined && rankObj !== null) {
                        rank = typeof rankObj === 'number' ? rankObj : (rankObj[0] || 0);
                    }
                } catch(e) {}
                target.style('width', nodeMaxSize*rank+nodeMinSize);
                target.style('height', nodeMaxSize*rank+nodeMinSize);
                target.style('font-size', fontMaxSize*rank+fontMinSize);
                target.style('color', fontColor);
            });
            target_cy.edges().forEach(function(target){
                target.style('line-color', edgeBGColor);
                target.style('target-arrow-color', edgeBGColor);
                target.style('width', edgeWidth);
                target.style('arrow-scale', arrowScale);
            });
        });
    }

    function setFocus(target_element, successorsColor, predecessorsColor, edgeWidth, arrowScale){
        cy.batch(function() {
            target_element.style('background-color', nodeActiveBGColor);
            target_element.style('color', fontColor);
            target_element.successors().each(
                function(e){
                    if(e.isEdge()){
                        e.style('width', edgeWidth);
                        e.style('arrow-scale', arrowScale);
                    }
                    e.style('color',fontColor);
                    e.style('background-color',successorColor);
                    e.style('line-color', successorColor);
                    e.style('target-arrow-color', successorColor);
                    e.style('z-index', getMaxZIndex());
                    setOpacityElement(e, 1);
                }
            );
            target_element.predecessors().each(function(e){
                if(e.isEdge()){
                    e.style('width', edgeWidth);
                    e.style('arrow-scale', arrowScale);
                }
                e.style('color',fontColor);
                e.style('background-color',predecessorsColor);
                e.style('line-color', predecessorsColor);
                e.style('target-arrow-color', predecessorsColor);
                e.style('z-index', getMaxZIndex());
                setOpacityElement(e, 1);
            });
            target_element.neighborhood().each(
                function(e){
                    var empDegree = 30;
                    e.style('background-color',tinycolor(e.style('background-color')).darken(empDegree).toString());
                    e.style('line-color', tinycolor(e.style('line-color')).darken(empDegree).toString());
                    e.style('target-arrow-color', tinycolor(e.style('target-arrow-color')).darken(empDegree).toString());
                }
            );
            target_element.style('z-index', getMaxZIndex());
            target_element.style('width', Math.max(parseFloat(target_element.style('width')), nodeActiveSize));
            target_element.style('height', Math.max(parseFloat(target_element.style('height')), nodeActiveSize));
            target_element.style('font-size', Math.max(parseFloat(target_element.style('font-size')), nodeActiveFontSize));
        });
    }

    function getMaxZIndex(){
        if(!window.zindex){
            window.zindex = 1;
        }
        return ++window.zindex;
    }

    fetch(getFetchURL())
        .then(function (res) {
            return res.json();
        })
        .then(function (data) {

            var layout = {
                name: 'cose-bilkent',
                animate: false,
                gravityRangeCompound: 1.5,
                fit: true,
                tile: true
            };

            cy = cytoscape({
                container: document.getElementById('cy'),
                elements: data,
                minZoom:0.2,
                wheelSensitivity:0.1,
                autounselectify: true,
                boxSelectionEnabled: false,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'font-family':'Open Sans Condensed',
                            'font-weight': '200',
                            'label': 'data(label)',
                            'text-valign': 'top',
                            'color': fontColor,
                            'text-outline-width': 0,
                            'text-outline-color': textOutlineColor,
                            'background-color': nodeBGColor,
                            'width':function(ele){
                                var rank = 0;
                                try {
                                    var r = pageRank.rank('#'+ele.id());
                                    if (r !== undefined && r !== null) {
                                        rank = typeof r === 'number' ? r : (r[0] || 0);
                                    }
                                } catch(e) {}
                                return nodeMaxSize*rank+nodeMinSize;
                            },
                            'height':function(ele){
                                var rank = 0;
                                try {
                                    var r = pageRank.rank('#'+ele.id());
                                    if (r !== undefined && r !== null) {
                                        rank = typeof r === 'number' ? r : (r[0] || 0);
                                    }
                                } catch(e) {}
                                return nodeMaxSize*rank+nodeMinSize;
                            },
                            'font-size':function(ele){
                                var rank = 0;
                                try {
                                    var r = pageRank.rank('#'+ele.id());
                                    if (r !== undefined && r !== null) {
                                        rank = typeof r === 'number' ? r : (r[0] || 0);
                                    }
                                } catch(e) {}
                                return fontMaxSize*rank+fontMinSize;
                            }
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'curve-style': 'bezier',
                            'width': 0.3,
                            'target-arrow-shape': 'triangle',
                            'line-color': edgeBGColor,
                            'target-arrow-color': edgeBGColor,
                        }
                    },
                    {
                        selector: '.prepare',
                        style: {
                            'opacity': '0.5'
                        }
                    },
                    {
                        selector: '.selected-target',
                        style: {
                            'border-width': 4,
                            'border-color': '#4a91f2'
                        }
                    },
                    {
                        selector: '.selected-source',
                        style: {
                            'border-width': 4,
                            'border-color': '#ff8b94'
                        }
                    }
                ],
                layout: layout
            });

            pageRank = cy.elements().pageRank();

            var home = getParameterByName('i');
            if(home){
                var _home = cy.$('#'+home);
                setResetFocus(cy);
                setFocus(_home, successorColor, predecessorsColor, edgeActiveWidth, arrowActiveScale);
            } else {
                setResetFocus(cy);
            }

            // Bind Cytoscape events to Alpine state
            cy.on('tap', 'node', function (e) {
                if (window.appStateInstance) {
                    window.appStateInstance.handleNodeClick(e.target);
                    // Force Alpine to re-evaluate state since this happened outside its event loop
                    if (window.appStateInstance.$apply) window.appStateInstance.$apply();
                }
            });

            cy.on('tap', function (e) {
                if(e.cy === e.target){
                    if (window.appStateInstance && !window.appStateInstance.isEditMode) {
                        setResetFocus(e.cy);
                    }
                }
            });

            cy.on('tapend mouseout', 'node', function(e){
                if (window.appStateInstance && window.appStateInstance.isEditMode) return;
                setResetFocus(e.cy);
            });

            cy.on('tapstart mouseover', 'node', function(e){
                if (window.appStateInstance && window.appStateInstance.isEditMode) return;
                setResetFocus(e.cy);
                setStyle(cy, {
                    'background-color':dimColor,
                    'line-color':dimColor,
                    'target-arrow-color':dimColor,
                    'color':dimColor
                });
                setFocus(e.target, successorColor, predecessorsColor, edgeActiveWidth, arrowActiveScale);
            });

            waitForWebfonts(['Open Sans Condensed'], function(){
                cy.forceRender();
            });

        });

    function debouncer(func, timeout) {
        var timeoutID, timeout = timeout || 200;
        return function () {
            var scope = this, args = arguments;
            clearTimeout(timeoutID);
            timeoutID = setTimeout(function () {
                func.apply(scope, Array.prototype.slice.call(args));
            }, timeout);
        }
    }

    function waitForWebfonts(fonts, callback) {
        var loadedFonts = 0;
        for(var i = 0, l = fonts.length; i < l; ++i) {
            (function(font) {
                var node = document.createElement('span');
                // Characters that vary significantly among different fonts
                node.innerHTML = 'giItT1WQy@!-/#';
                // Visible - so we can measure it - but not on the screen
                node.style.position      = 'absolute';
                node.style.left          = '-10000px';
                node.style.top           = '-10000px';
                // Large font size makes even subtle changes obvious
                node.style.fontSize      = '300px';
                // Reset any font properties
                node.style.fontFamily    = 'sans-serif';
                node.style.fontVariant   = 'normal';
                node.style.fontStyle     = 'normal';
                node.style.fontWeight    = 'normal';
                node.style.letterSpacing = '0';
                document.body.appendChild(node);

                // Remember width with no applied web font
                var width = node.offsetWidth;

                node.style.fontFamily = font + ', sans-serif';

                var interval;
                function checkFont() {
                    // Compare current width with original width
                    if(node && node.offsetWidth != width) {
                        ++loadedFonts;
                        node.parentNode.removeChild(node);
                        node = null;
                    }

                    // If all fonts have been loaded
                    if(loadedFonts >= fonts.length) {
                        if(interval) {
                            clearInterval(interval);
                        }
                        if(loadedFonts == fonts.length) {
                            callback();
                            return true;
                        }
                    }
                };

                if(!checkFont()) {
                    interval = setInterval(checkFont, 50);
                }
            })(fonts[i]);
        }
    };


    $(window).resize(debouncer(function () {
        cy.fit()
    }))
    $(document).one('touchstart click', function () {
        cy.userPanningEnabled(true)
    })
