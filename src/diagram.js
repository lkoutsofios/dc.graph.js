/**
## Diagram

The dc_graph.diagram is a dc.js-compatible network visualization component. It registers in
the dc.js chart registry and its nodes and edges are generated from crossfilter groups. It
logically derives from
[the dc.js Base Mixin](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#base-mixin),
but it does not physically derive from it since so much is different about network visualization
versus conventional diagraming.
**/
dc_graph.diagram = function (parent, chartGroup) {
    // different enough from regular dc charts that we don't use bases
    var _chart = {};
    var _svg = null, _g = null, _nodeLayer = null, _edgeLayer = null;
    var _d3cola = null;
    var _dispatch = d3.dispatch('end');
    var _stats = {};
    var _nodes_snapshot, _edges_snapshot;

    // we want to allow either values or functions to be passed to specify parameters.
    // if a function, the function needs a preprocessor to extract the original key/value
    // pair from the wrapper object we put it in.
    function param(v) {
        return dc_graph.functor_wrap(v, function(x) {
            return x.orig;
        });
    }

    /**
     #### .width([value])
     Set or get the width attribute of the diagram. See `.height` below. Default: 200
     **/
    _chart.width = property(200).react(resizeSvg);

    /**
     #### .height([value])
     Set or get the height attribute of the diagram. The width and height are applied to the SVG
     element generated by the diagram when rendered. If a value is given, then the diagram is returned
     for method chaining. If no value is given, then the current value of the height attribute will
     be returned. Default: 200
     **/
    _chart.height = property(200).react(resizeSvg);

    /**
     #### .root([rootElement])
     Get or set the root element, which is usually the parent div. Normally the root is set when the
     diagram is constructed; setting it later may have unexpected consequences.
     **/
    _chart.root = property(null).react(function(e) {
        if(e.empty())
            console.log('Warning: parent selector ' + parent + " doesn't seem to exist");
    });

    /**
     #### .mouseZoomable([boolean])
     Get or set whether mouse wheel rotation or touchpad gestures will zoom the diagram, and whether dragging
     on the background pans the diagram.
     **/
    _chart.mouseZoomable = property(true);

    /**
     #### .nodeDimension([value])
     Set or get the crossfilter dimension which represents the nodes (vertices) in the diagram. Typically there will
     be a crossfilter instance for the nodes, and another for the edges.

     *The node dimension currently does nothing, but once selection is supported, it will be used for
     filtering other charts on the same crossfilter instance based on the nodes selected.*
     **/
    _chart.nodeDimension = property();

    /**
     #### .nodeGroup([value]) - **mandatory**
     Set or get the crossfilter group which is the data source for the nodes in the diagram. The diagram will
     use the group's `.all()` method to get an array of `{key, value}` pairs, where the key is a unique
     identifier, and the value is usually an object containing the node's attributes. All accessors work
     with these key/value pairs.

     If the group is changed or returns different values, the next call to `.redraw()` will reflect the changes
     incrementally.

     It is possible to pass another object with the same `.all()` interface instead of a crossfilter group.
     **/
    _chart.nodeGroup = property();

    /**
     #### .edgeDimension([value])
     Set or get the crossfilter dimension which represents the edges in the diagram. Typically there will
     be a crossfilter instance for the nodes, and another for the edges.

     *The edge dimension currently does nothing, but once selection is supported, it will be used for filtering
     other charts on the same crossfilter instance based on the edges selected.*
     **/
    _chart.edgeDimension = property();

    /**
     #### .edgeGroup([value]) - **mandatory**
     Set or get the crossfilter group which is the data source for the edges in the diagram. See `.nodeGroup`
     above for the way data is loaded from a crossfilter group.

     The values in the key/value pairs returned by `diagram.edgeGroup().all()` need to support, at a minimum,
     the `sourceAccessor` and `targetAccessor`, which should return the same keys as the `nodeKeyAccessor`
     **/
    _chart.edgeGroup = property();

    /**
     #### .nodeKeyAccessor([function])
     Set or get the function which will be used to retrieve the unique key for each node. By default, this
     accesses the `key` field of the object passed to it. The keys should match the keys returned by the
     `.sourceAccessor` and `.targetAccessor` of the edges.
     **/
    _chart.nodeKeyAccessor = property(function(kv) {
        return kv.key;
    });

    /**
     #### .edgeKeyAccessor([function])
     Set or get the function which will be used to retrieve the unique key for each edge. By default, this
     accesses the `key` field of the object passed to it.
     **/
    _chart.edgeKeyAccessor = property(function(kv) {
        return kv.key;
    });

    /**
     #### .sourceAccessor([function])
     Set or get the function which will be used to retrieve the source (origin/tail) key of the edge objects.
     The key must equal the key returned by the `.nodeKeyAccessor` for one of the nodes; if it does not, or
     if the node is currently filtered out, the edge will not be displayed.
     **/
    _chart.sourceAccessor = property(function(kv) {
        return kv.value.sourcename;
    });

    /**
     #### .targetAccessor([function])
     Set or get the function which will be used to retrieve the target (destination/head) key of the edge objects.
     The key must equal the key returned by the `.nodeKeyAccessor` for one of the nodes; if it does not, or
     if the node is currently filtered out, the edge will not be displayed.
     **/
    _chart.targetAccessor = property(function(kv) {
        return kv.value.targetname;
    });

    /**
     #### .nodeRadiusAccessor([function])
     Set or get the function which will be used to retrieve the radius, in pixels, for each node. Nodes are
     currently all displayed as circles. Default: 25
     **/
    _chart.nodeRadiusAccessor = property(function() {
        return 25;
    });

    /**
     #### .nodeStrokeWidthAccessor([function])
     Set or get the function which will be used to retrieve the stroke width, in pixels, for drawing the outline of each
     node. According to the SVG specification, the outline will be drawn half on top of the fill, and half
     outside. Default: 1
     **/
    _chart.nodeStrokeWidthAccessor = property(function() {
        return '1';
    });

    /**
     #### .nodeStrokeAccessor([function])
     Set or get the function which will be used to retrieve the stroke color for the outline of each
     node. Default: black
     **/
    _chart.nodeStrokeAccessor = property(function() {
        return 'black';
    });

    /**
     #### .nodeFillScale([d3.scale])
     If set, the value returned from `nodeFillAccessor` will be processed through this d3.scale
     to return the fill color. Default: identity function (no scale)
     **/
    _chart.nodeFillScale = property(identity);

    /**
     #### .nodeFillAccessor([function])
     Set or get the function which will be used to retrieve the fill color for the body of each
     node. Default: white
     **/
    _chart.nodeFillAccessor = property(function() {
        return 'white';
    });

    /**
     #### .nodePadding([number])
     Set or get the padding or minimum distance, in pixels, between nodes in the diagram. Default: 6
     **/
    _chart.nodePadding = property(6);

    /**
     #### .nodeLabelAccessor([function])
     Set or get the function which will be used to retrieve the label text to display in each node. By
     default, looks for a field `label` or `name` inside the `value` field.
     **/
    _chart.nodeLabelAccessor = property(function(kv) {
        return kv.value.label || kv.value.name;
    });
    /**
     #### .nodeFitLabelAccessor([function])
     Whether to fit the node shape around the label. Default: true
     **/
    _chart.nodeFitLabelAccessor = property(true);

    /**
     #### .nodeTitleAccessor([function])
     Set or get the function which will be used to retrieve the node title, usually rendered as a tooltip.
     By default, uses the key of the node.
     **/
    _chart.nodeTitleAccessor = property(function(kv) {
        return _chart.nodeKeyAccessor()(kv);
    });

    /**
     #### .nodeOrdering([function])
     By default, nodes are added to the layout in the order that `.nodeGroup().all()` returns them. If
     specified, `.nodeOrdering` provides an accessor that returns a key to sort the nodes on.
     It would be better not to rely on ordering to affect layout, but it does matter.
     **/
    _chart.nodeOrdering = property(null);

    /**
     #### .nodeFixedAccessor([function])
     Specify an accessor that returns an {x,y} coordinate for a node that should be
     [fixed in place](https://github.com/tgdwyer/WebCola/wiki/Fixed-Node-Positions), and returns
     falsy for other nodes.
     **/
    _chart.nodeFixedAccessor = property(null);


    /**
     #### .edgeStrokeAccessor([function])
     Set or get the function which will be used to retrieve the stroke color for the edges. Default: black
     **/
    _chart.edgeStrokeAccessor = property(function() {
        return 'black';
    });

    /**
     #### .edgeStrokeWidthAccessor([function])
     Set or get the function which will be used to retrieve the stroke width for the edges. Default: 1
     **/
    _chart.edgeStrokeWidthAccessor = property(function() {
        return '1';
    });

    /**
     #### .edgeOpacityAccessor([function])
     Set or get the function which will be used to retrieve the edge opacity, a number from 0 to 1. Default: 1
     **/
    _chart.edgeOpacityAccessor = property(function() {
        return '1';
    });

    /**
     #### .edgeLabelAccessor([function])
     Set or get the function which will be used to retrieve the edge label text. The label is displayed when
     an edge is hovered over. By default, uses the `edgeKeyAccessor`.
     **/
    _chart.edgeLabelAccessor = property(function(d) {
        return _chart.edgeKeyAccessor()(d);
    });

    /**
     #### .edgeArrowheadAccessor([function])
     Set or get the function which will be used to retrieve the name of the arrowhead to use for the target/
     head/destination of the edge. Arrow symbols can be specified with `.defineArrow()`. Return null to
     display no arrowhead. Default: 'vee'
     **/
    _chart.edgeArrowheadAccessor = property(function() {
        return 'vee';
    });

    /**
     #### .edgeArrowtailAccessor([function])
     Set or get the function which will be used to retrieve the name of the arrow tail to use for the source/
     tail/source of the edge. Arrow symbols can be specified with `.defineArrow()`. Return null to
     display no arrowhead. Default: null
     **/
    _chart.edgeArrowtailAccessor = property(function() {
        return null;
    });

    /**
     #### .edgeIsLayoutAccessor([function])
     To draw an edge but not have it affect the layout, specify a function which returns false for that edge.
     By default, will return false if the `notLayout` field of the edge is truthy, true otherwise.
     **/
    _chart.edgeIsLayoutAccessor = property(function(kv) {
        return !kv.value.notLayout;
    });

    /**
     #### .lengthStrategy([string])
     Currently, three strategies are supported for specifying the lengths of edges:
     * 'individual' - uses the `edgeDistanceAccessor` for each edge. If it returns falsy, uses the `baseLength`
     * 'symmetric', 'jaccard' - compute the edge length based on the graph structure around the edge. See [the
     cola.js wiki](https://github.com/tgdwyer/WebCola/wiki/link-lengths) for more details.
     * 'none' - no edge lengths will be specified
     **/
    _chart.lengthStrategy = property('symmetric');

    /**
     #### .edgeDistanceAccessor([function])
     When the `.lengthStrategy` is 'individual', this accessor will be used to read the length of each edge.
     By default, reads the `distance` field of the edge. If the distance is falsy, uses the `baseLength`.
     **/
    _chart.edgeDistanceAccessor = property(function(kv) {
        return kv.value.distance;
    });

    /**
     #### .baseLength([number])
     Gets or sets the default edge length (in pixels) when the `.lengthStrategy` is 'individual', and the base
     value to be multiplied for 'symmetric' and 'jaccard' edge lengths.
     **/
    _chart.baseLength = property(30);

    _chart.transitionDuration = property(500);

    /** .timeLimit([number])
     Gets or sets the maximum time spent doing layout for a render or redraw. Set to 0 for now limit.
     Default: 0
     **/
    _chart.timeLimit = property(0);

    /**
     #### .constrain([function])
     This function will be called with the current nodes and edges on each redraw in order to derive new
     layout constraints. By default, no constraints will be added beyond those for edge lengths, but this
     can be used to generate alignment (rank) or axis constraints. See
     [the cola.js wiki](https://github.com/tgdwyer/WebCola/wiki/Constraints) for more details. The constraints
     are built from scratch on each redraw.
     **/
    _chart.constrain = property(function(nodes, edges) {
        return [];
    });

    /**
     #### .parallelEdgeOffset([number])
     If there are multiple edges between the same two nodes, start them this many pixels away from the original
     so they don't overlap.
     Default: 5
     **/
    _chart.parallelEdgeOffset = property(5);

    /**
     #### .edgeOrdering([function])
     By default, edges are added to the layout in the order that `.edgeGroup().all()` returns them. If
     specified, `.edgeOrdering` provides an accessor that returns a key to sort the edges on.
     It would be better not to rely on ordering to affect layout, but it does matter. (Probably less
     than node ordering, but it does affect which parallel edge is which.)
     **/
    _chart.edgeOrdering = property(null);

    /**
     #### .initLayoutOnRedraw([boolean])
     Currently there are some bugs when the same instance of cola.js is used multiple times. (In particular,
     overlaps between nodes may not be eliminated [if cola is not reinitialized]
     (https://github.com/tgdwyer/WebCola/issues/118)). This flag can be set true to construct a new cola
     layout object on each redraw. However, layout seems to be more stable if this is set false, so hopefully
     this will be fixed soon.
     **/
    _chart.initLayoutOnRedraw = property(false);

    /**
     #### .layoutUnchanged([boolean])
     Whether to perform layout when the data is unchanged from the last redraw. Default: false
     **/
    _chart.layoutUnchanged = property(false);

    /**
     #### .relayout()
     When `layoutUnchanged` is false, call this when changing a parameter in order to force layout
     to happen again. (Yes, probably should not be necessary.)
     **/
    _chart.relayout = function() {
        _nodes_snapshot = _edges_snapshot = null;
        return this;
    };

    /**
     #### .induceNodes([boolean])
     By default, all nodes are included, and edges are only included if both end-nodes are visible.
     If `.induceNodes` is set, then only nodes which have at least one edge will be shown.
     **/
     _chart.induceNodes = property(false);

    /**
     #### .modLayout([function])
     If it is desired to modify the cola layout object after it is created, this function can be called to add
     a modifier function which takes the layout object.
     **/
    _chart.modLayout = property(function(layout) {});

    /**
     #### .showLayoutSteps([boolean])
     If this flag is true, the positions of nodes and will be updated while layout is iterating. If false,
     the positions will only be updated once layout has stabilized. Default: true
     **/
    _chart.showLayoutSteps = property(true);

    _chart.legend = property(null).react(function(l) {
        l.parent(_chart);
    });

    function initLayout() {
        _d3cola = cola.d3adaptor()
            .avoidOverlaps(true)
            .size([_chart.width(), _chart.height()]);

        switch(_chart.lengthStrategy()) {
        case 'symmetric':
            _d3cola.symmetricDiffLinkLengths(_chart.baseLength());
            break;
        case 'jaccard':
            _d3cola.jaccardLinkLengths(_chart.baseLength());
            break;
        case 'individual':
            _d3cola.linkDistance(function(e) {
                var d = e.orig ? param(_chart.edgeDistanceAccessor())(e) :
                        e.internal && e.internal.distance;
                return d || _chart.baseLength();
            });
            break;
        case 'none':
        default:
        }

        if(_chart.modLayout())
            _chart.modLayout()(_d3cola);
    }

    function edge_id(d) {
        return 'edge-' + param(_chart.edgeKeyAccessor())(d).replace(/[^\w-_]/g, '-');
    }

    var _nodes = {}, _edges = {};

    _chart._buildNode = function(node, nodeEnter) {
        nodeEnter.append('title');
        nodeEnter.append('ellipse');
        nodeEnter.append('text')
            .attr('class', 'node-label');
        node.select('title')
            .text(param(_chart.nodeTitleAccessor()));
        node.select('text.node-label')
            .text(param(_chart.nodeLabelAccessor()))
            .each(function(d, i) {
                var r = param(_chart.nodeRadiusAccessor())(d);
                var rplus = r*2 + _chart.nodePadding();
                var bbox;
                if(param(_chart.nodeFitLabelAccessor())(d))
                    bbox = this.getBBox();
                var fitx = 0;
                if(bbox && bbox.width && bbox.height) {
                    // solve (x/A)^2 + (y/B)^2) = 1 for A, with B=r, to fit text in ellipse
                    var y_over_B = bbox.height/2/r;
                    var rx = bbox.width/2/Math.sqrt(1 - y_over_B*y_over_B);
                    fitx = rx*2 + _chart.nodePadding();
                    d.dcg_rx = Math.max(rx, r);
                    d.dcg_ry = r;
                }
                else d.dcg_rx = d.dcg_ry = r;
                d.width = Math.max(fitx, rplus);
                d.height = rplus;
            });
        node.select('ellipse')
            .attr('rx', function(d) { return d.dcg_rx; })
            .attr('ry', function(d) { return d.dcg_ry; })
            .attr('stroke', param(_chart.nodeStrokeAccessor()))
            .attr('stroke-width', param(_chart.nodeStrokeWidthAccessor()))
            .attr('fill', compose(_chart.nodeFillScale(), param(_chart.nodeFillAccessor())));
    };

    /**
     #### .redraw()
     Computes a new layout based on the nodes and edges in the edge groups, and displays the diagram.
     To the extent possible, the diagram will minimize changes in positions from the previous layout.
     `.render()` must be called the first time, and `.redraw()` can be called after that.

     `.redraw()` will be triggered by changes to the filters in any other charts in the same dc.js
     chart group.
     **/
    _chart.redraw = function () {
        var nodes = _chart.nodeGroup().all();
        var edges = _chart.edgeGroup().all();

        if(_d3cola)
            _d3cola.stop();
        if(_chart.initLayoutOnRedraw())
            initLayout();

        if(_chart.induceNodes()) {
            var keeps = {};
            edges.forEach(function(e) {
                keeps[_chart.sourceAccessor()(e)] = true;
                keeps[_chart.targetAccessor()(e)] = true;
            });
            nodes = nodes.filter(function(n) { return keeps[_chart.nodeKeyAccessor()(n)]; });
        }

        if(_chart.nodeOrdering()) {
            nodes = crossfilter.quicksort.by(_chart.nodeOrdering())(nodes.slice(0), 0, nodes.length);
        }
        if(_chart.edgeOrdering()) {
            edges = crossfilter.quicksort.by(_chart.edgeOrdering())(edges.slice(0), 0, edges.length);
        }

        function wrap_node(v, i) {
            var key = _chart.nodeKeyAccessor()(v);
            if(!_nodes[key]) _nodes[key] = {};
            var v1 = _nodes[key];
            v1.orig = v;
            v1.index = i;
            var fixed;
            if(_chart.nodeFixedAccessor())
                fixed = _chart.nodeFixedAccessor()(v);
            if(fixed) {
                v1.x = v.x;
                v1.y = v.y;
                v1.fixed = true;
            }
            else
                v1.fixed = false;
            keep_node[key] = true;
            return v1;
        }
        function wrap_edge(e) {
            var key = _chart.edgeKeyAccessor()(e);
            if(!_edges[key]) _edges[key] = {};
            var e1 = _edges[key];
            e1.orig =  e;
            e1.source = _nodes[_chart.sourceAccessor()(e)];
            e1.target = _nodes[_chart.targetAccessor()(e)];
            keep_edge[key] = true;
            return e1;
        }
        var keep_node = {}, keep_edge = {};
        var nodes1 = nodes.map(wrap_node);
        // delete any objects from last round that are no longer used
        for(var vk in _nodes)
            if(!keep_node[vk])
                delete _nodes[vk];
        for(var ek in _edges)
            if(!keep_edge[ek])
                delete _edges[ek];
        var edges1 = edges.map(wrap_edge).filter(function(e) {
            return e.source!==undefined && e.target!==undefined;
        });
        _stats = {nnodes: nodes1.length, nedges: edges1.length};
        var skip_layout = false;
        if(!_chart.layoutUnchanged()) {
            function original(x) {
                return x.orig;
            }
            var nodes_snapshot = JSON.stringify(nodes1.map(original)), edges_snapshot = JSON.stringify(edges1.map(original));
            if(nodes_snapshot === _nodes_snapshot && edges_snapshot === _edges_snapshot)
                skip_layout = true;
            _nodes_snapshot = nodes_snapshot;
            _edges_snapshot = edges_snapshot;
        }

        if(_chart.parallelEdgeOffset()) {
            // mark parallel edges so we can draw them specially
            var em = new Array(nodes1.length);
            for(var i = 0; i < em.length; ++i) {
                em[i] = new Array(em.length); // technically could be diagonal array
                for(var j = 0; j < em.length; ++j)
                    em[i][j] = 0;
            }
            edges1.forEach(function(e) {
                var min = Math.min(e.source.index, e.target.index), max = Math.max(e.source.index, e.target.index);
                e.parallel = em[min][max]++;
            });
        }

        // console.log("diagram.redraw " + nodes1.length + ',' + edges1.length);

        var edge = _edgeLayer.selectAll('.edge')
                .data(edges1, param(_chart.edgeKeyAccessor()));
        var edgeEnter = edge.enter().append('svg:path')
                .attr('class', 'edge')
                .attr('id', edge_id);
        edge
            .attr('stroke', param(_chart.edgeStrokeAccessor()))
            .attr('stroke-width', param(_chart.edgeStrokeWidthAccessor()))
            .attr('opacity', param(_chart.edgeOpacityAccessor()))
            .attr('marker-end', function(d) {
                var id = param(_chart.edgeArrowheadAccessor())(d);
                return id ? 'url(#' + id + ')' : null;
            })
            .attr('marker-start', function(d) {
                var id = param(_chart.edgeArrowtailAccessor())(d);
                return id ? 'url(#' + id + ')' : null;
            });
        var edgeExit = edge.exit();
        edgeExit.remove();

        // another wider copy of the edge just for hover events
        var edgeHover = _edgeLayer.selectAll('.edge-hover')
                .data(edges1, param(_chart.edgeKeyAccessor()));
        edgeHover.enter().append('svg:path')
            .attr('class', 'edge-hover')
            .attr('opacity', 0)
            .attr('stroke', 'green')
            .attr('stroke-width', 10)
            .on('mouseover', function(d) {
                d3.select('#' + edge_id(d) + '-label')
                    .attr('visibility', 'visible');
            })
            .on('mouseout', function(d) {
                d3.select('#' + edge_id(d) + '-label')
                    .attr('visibility', 'hidden');
            });
        edgeHover.exit().remove();

        var edgeLabels = _edgeLayer.selectAll(".edge-label")
                .data(edges1, param(_chart.edgeKeyAccessor()));
        var edgeLabelsEnter = edgeLabels.enter()
              .append('text')
                .attr('id', function(d) {
                    return edge_id(d) + '-label';
                })
                .attr('visibility', 'hidden')
                .attr({'class':'edge-label',
                       'text-anchor': 'middle',
                       dy:-2})
              .append('textPath')
                .attr('startOffset', '50%')
                .attr('xlink:href', function(d) {
                    return '#' + edge_id(d);
                })
                .text(function(d){
                    return param(_chart.edgeLabelAccessor())(d);
                });
        edgeLabels.exit().remove();

        var node = _nodeLayer.selectAll('.node')
                .data(nodes1, param(_chart.nodeKeyAccessor()));
        var nodeEnter = node.enter().append('g')
                .attr('class', 'node')
                .attr('visibility', 'hidden') // don't show until has layout
                .call(_d3cola.drag);
        _chart._buildNode(node, nodeEnter);
        var nodeExit = node.exit();
        // i am not satisfied with this constraint generation api...
        // https://github.com/dc-js/dc.graph.js/issues/10
        var constraints = _chart.constrain()(nodes1, edges1);
        // translate references from names to indices (ugly)
        constraints.forEach(function(c) {
            if(c.type) {
                switch(c.type) {
                case 'alignment':
                    c.offsets.forEach(function(o) {
                        o.node = _nodes[o.node].index;
                    });
                    break;
                case 'circle':
                    c.nodes.forEach(function(n) {
                        n.node = _nodes[n.node].index;
                    });
                    break;
                }
            } else if(c.axis) {
                c.left = _nodes[c.left].index;
                c.right = _nodes[c.right].index;
            }
        });
        nodeExit.remove();

        _d3cola.on('tick', function() {
            var elapsed = Date.now() - startTime;
            if(_chart.showLayoutSteps())
                draw(node, edge, edgeHover, edgeLabels);
            if(_chart.timeLimit() && elapsed > _chart.timeLimit()) {
                console.log('cancelled');
                _d3cola.stop();
                _dispatch.end();
            }
        });

        // pseudo-cola.js features

        // 1. non-layout edges are drawn but not told to cola.js
        var layout_edges = edges1.filter(param(_chart.edgeIsLayoutAccessor()));
        var nonlayout_edges = edges1.filter(function(x) {
            return !param(_chart.edgeIsLayoutAccessor())(x);
        });

        // 2. type=circle constraints
        var circle_constraints = constraints.filter(function(c) {
            return c.type === 'circle';
        });
        constraints = constraints.filter(function(c) {
            return c.type !== 'circle';
        });
        circle_constraints.forEach(function(c) {
            var R = (c.distance || _chart.baseLength()*4) / (2*Math.sin(Math.PI/c.nodes.length));
            var nindices = c.nodes.map(function(x) { return x.node; });
            var namef = function(i) {
                return param(_chart.nodeKeyAccessor())(nodes1[i]);
            };
            var wheel = dc_graph.wheel_edges(namef, nindices, R)
                    .map(function(e) {
                        var e1 = {internal: e};
                        e1.source = _nodes[e.sourcename];
                        e1.target = _nodes[e.targetname];
                        return e1;
                    });
            layout_edges = layout_edges.concat(wheel);
        });

        // 3. ordered alignment
        var ordered_constraints = constraints.filter(function(c) {
            return c.type === 'ordering';
        });
        constraints = constraints.filter(function(c) {
            return c.type !== 'ordering';
        });
        ordered_constraints.forEach(function(c) {
            var sorted = crossfilter.quicksort.by(param(c.ordering))(
                c.nodes.map(function(n) { return _nodes[n]; }), 0, c.nodes.length);
            var left;
            sorted.forEach(function(n, i) {
                if(i===0)
                    left = n;
                else {
                    constraints.push({
                        left: left.index,
                        right: (left = n).index,
                        axis: c.axis,
                        gap: c.gap
                    });
                }
            });
        });
        if(skip_layout) {
            _dispatch.end();
            return this;
        }
        var startTime = Date.now();
        _d3cola.nodes(nodes1)
            .links(layout_edges)
            .constraints(constraints)
            .start(10,20,20)
            .on('end', function() {
                if(!_chart.showLayoutSteps())
                    draw(node, edge, edgeHover, edgeLabels);
                _dispatch.end();
            });
        return this;
    };

    function edge_path(d) {
        var deltaX = d.target.x - d.source.x,
            deltaY = d.target.y - d.source.y,
            sourcePadding = d.source.dcg_ry +
                param(_chart.nodeStrokeWidthAccessor())(d.source) / 2,
            targetPadding = d.target.dcg_ry +
                param(_chart.nodeStrokeWidthAccessor())(d.target) / 2;

        var sourceX, sourceY, targetX, targetY, sp, tp;
        if(!d.parallel) {
            sp = point_on_ellipse(d.source.dcg_rx, d.source.dcg_ry, deltaX, deltaY);
            tp = point_on_ellipse(d.target.dcg_rx, d.target.dcg_ry, -deltaX, -deltaY);
            sourceX = d.source.x + sp.x;
            sourceY = d.source.y + sp.y;
            targetX = d.target.x + tp.x;
            targetY = d.target.y + tp.y;
            d.length = Math.hypot(targetX-sourceX, targetY-sourceY);
            return generate_path([sourceX, sourceY, targetX, targetY], 1);
        }
        else {
            // alternate parallel edges over, then under
            var dir = (!!(d.parallel%2) === (d.source.x < d.target.x)) ? -1 : 1,
                port = Math.floor((d.parallel+1)/2) * dir,
                srcang = Math.atan2(deltaY, deltaX),
                sportang = srcang + port * _chart.parallelEdgeOffset() / sourcePadding,
                tportang = srcang - Math.PI - port * _chart.parallelEdgeOffset() / targetPadding,
                cos_sport = Math.cos(sportang),
                sin_sport = Math.sin(sportang),
                cos_tport = Math.cos(tportang),
                sin_tport = Math.sin(tportang),
                dist = Math.hypot(d.target.x - d.source.x, d.target.y - d.source.y);
            sp = point_on_ellipse(d.source.dcg_rx, d.source.dcg_ry, cos_sport, sin_sport);
            tp = point_on_ellipse(d.target.dcg_rx, d.target.dcg_ry, cos_tport, sin_tport);
            var sdist = Math.hypot(sp.x, sp.y),
                tdist = Math.hypot(tp.x, tp.y),
                c1dist = Math.max(sdist+sourcePadding/4, Math.min(sdist*2, dist/2)),
                c2dist = Math.min(tdist+targetPadding/4, Math.min(tdist*2, dist/2));
            sourceX = d.source.x + sp.x;
            sourceY = d.source.y + sp.y;
            var c1X = d.source.x + c1dist * cos_sport,
                c1Y = d.source.y + c1dist * sin_sport,
                c2X = d.target.x + c2dist * cos_tport,
                c2Y = d.target.y + c2dist * sin_tport;
            targetX = d.target.x + tp.x;
            targetY = d.target.y + tp.y;
            d.length = Math.hypot(targetX-sourceX, targetY-sourceY);
            return generate_path([sourceX, sourceY, c1X, c1Y, c2X, c2Y, targetX, targetY], 3);
        }
    }
    function draw(node, edge, edgeHover, edgeLabels) {
        node.attr('visibility', 'visible')
            .attr("transform", function (d) {
                return "translate(" + d.x + "," + d.y + ")";
            });

        edge.attr("d", edge_path);
        edgeHover.attr('d', edge_path);

        edgeLabels
            .attr('transform', function(d,i) {
            if (d.target.x < d.source.x) {
                var bbox = this.getBBox(),
                    rx = bbox.x + bbox.width/2,
                    ry = bbox.y + bbox.height/2;
                return 'rotate(180 ' + rx + ' ' + ry + ')';
            }
            else {
                return 'rotate(0)';
            }
        })
            .attr('dy', function(d, i) {
                if (d.target.x < d.source.x)
                    return 11;
                else
                    return -2;
            });
    }

    /**
     #### .render()
     Erases any existing SVG elements and draws the diagram from scratch. `.render()` must be called
     the first time, and `.redraw()` can be called after that.
     **/
    _chart.render = function () {
        if(!_chart.initLayoutOnRedraw())
            initLayout();
        _chart.resetSvg();
        _g = _svg.append('g').attr('class', 'dc-graph');
        _edgeLayer = _g.append('g');
        _nodeLayer = _g.append('g');

        if(_chart.legend())
            _chart.legend().render();
        return _chart.redraw();
    };

    /**
     #### .on()
     Attaches an event handler to the diagram. Currently the only diagram event is `end`, signalling
     that diagram layout has completed.
     **/
    _chart.on = function(event, f) {
        _dispatch.on(event, f);
        return this;
    };

    /**
     #### .getStats()
     Returns an object with current statistics on graph layout.
     * `nnodes` - number of nodes displayed
     * `nedges` - number of edges displayed
     **/
    _chart.getStats = function() {
        return _stats;
    };


    /**
     #### .select(selector)
     Execute a d3 single selection in the diagram's scope using the given selector and return the d3
     selection. Roughly the same as

     ```js
     d3.select('#diagram-id').select(selector)
     ```

     Since this function returns a d3 selection, it is not chainable. (However, d3 selection calls can
     be chained after it.)
     **/
    _chart.select = function (s) {
        return _chart.root().select(s);
    };

    /**
     #### .selectAll(selector)
     Selects all elements that match the d3 single selector in the diagram's scope, and return the d3
     selection. Roughly the same as

     ```js
     d3.select('#diagram-id').selectAll(selector)
     ```

     Since this function returns a d3 selection, it is not chainable. (However, d3 selection calls can
     be chained after it.)
     **/
    _chart.selectAll = function (s) {
        return _chart.root() ? _chart.root().selectAll(s) : null;
    };

    /**
     #### .svg([svgElement])
     Returns the top svg element for this specific chart. You can also pass in a new svg element, but
     setting the svg element on a diagram may have unexpected consequences.

    **/
    _chart.svg = function (_) {
        if (!arguments.length) {
            return _svg;
        }
        _svg = _;
        return _chart;
    };

    /**
    #### .resetSvg()
    Remove the diagram's SVG elements from the dom and recreate the container SVG element.
    **/
    _chart.resetSvg = function () {
        _chart.select('svg').remove();
        return generateSvg();
    };

    /**
    #### .defineArrow(name, width, height, refX, refY, drawf)
    Creates an svg marker definition for drawing edge arrow tails or heads.
     * **name** - the `id` to give the marker. When this identifier is returned by `.edgeArrowheadAccessor`
     or `.edgeArrowtailAccessor`, that edge will be drawn with the specified marker for its source or target.
     * **width** - the width, in pixels, to draw the marker
     * **height** - the height, in pixels, to draw the marker
     * **refX**, **refY** - the reference position, in marker coordinates, which will be aligned to the
     endpoint of the edge
     * **drawf** - a function to draw the marker using d3 SVG primitives, which takes the marker object as
     its parameter. The `viewBox` of the marker is `0 -5 10 10`, so the arrow should be drawn from (0, -5)
     to (10, 5) and it will be moved and sized based on the other parameter, and rotated based on the
     orientation of the edge.

     For example, the built-in `vee` arrow is defined so:
     ```js
     _chart.defineArrow('vee', 12, 12, 10, 0, function(marker) {
         marker.append('svg:path')
             .attr('d', 'M0,-5 L10,0 L0,5 L3,0')
             .attr('stroke-width', '0px');
     });
     (If further customization is required, it is possible to append other `svg:defs` to `chart.svg()`
     and use refer to them by `id`.)
     ```
    **/
    _chart.defineArrow = function(name, width, height, refX, refY, drawf) {
        _svg.append('svg:defs').append('svg:marker')
            .attr('id', name)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', refX)
            .attr('refY', refY)
            .attr('markerUnits', 'userSpaceOnUse')
            .attr('markerWidth', width)
            .attr('markerHeight', height)
            .attr('orient', 'auto')
            .call(drawf);
    };

    function doZoom() {
        _g.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
    }

    function resizeSvg() {
        if(_svg) {
            _svg.attr('width', _chart.width())
                .attr('height', _chart.height());
        }
    }

    function generateSvg() {
        _svg = _chart.root().append('svg');
        resizeSvg();

        _chart.defineArrow('vee', 12, 12, 10, 0, function(marker) {
            marker.append('svg:path')
                .attr('d', 'M0,-5 L10,0 L0,5 L3,0')
                .attr('stroke-width', '0px');
        });
        _chart.defineArrow('dot', 7, 7, 0, 0, function(marker) {
            marker.append('svg:circle')
                .attr('r', 5)
                .attr('cx', 5)
                .attr('cy', 0)
                .attr('stroke-width', '0px');
        });
        if(_chart.mouseZoomable())
            _svg.call(d3.behavior.zoom().on("zoom", doZoom));

        return _svg;
    }

    _chart.root(d3.select(parent));

    dc.registerChart(_chart, chartGroup);
    return _chart;
};

