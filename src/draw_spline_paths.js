dc_graph.draw_spline_paths = function(pathreader, pathprops, hoverprops, selectprops, pathsgroup) {
    var highlight_paths_group = dc_graph.register_highlight_paths_group(pathsgroup || 'highlight-paths-group');
    pathprops = pathprops || {};
    hoverprops = hoverprops || {};
    selectprops = selectprops || {};
    var pathsAll = null;
    var _anchor;
    var _layer = null;

    function paths_changed(nop, eop, paths) {
        // create the layer if it's null
        if(_layer === null) {
            _layer = _behavior.parent().select('g.draw').append('g').attr('class', 'spline-layer');
        }

        pathsAll = paths;

        //clear old paths
        _layer.selectAll('.spline-edge').remove();
        _layer.selectAll('.spline-edge-hover').remove();

        // check if path exits on current chart
        if(pathExists(paths) === true) {
            //relayoutPath(paths);
            _behavior.parent().layoutEngine().paths(paths);
            drawSpline(paths, pathprops);
        } else {
            _behavior.parent().layoutEngine().paths(null);
        }
    }

    // check if path exists in current view
    function pathExists(paths) {
        var nodesCount = 0;
        paths.forEach(function(d) {
            nodesCount += getNodePosition(d).length;
        });
        return nodesCount > 0;
    }

    function getNodePosition(path) {
        var _chart = _behavior.parent();
        var plist = [];

        pathreader.elementList.eval(path).forEach(function(element) {
            var key, node;
            switch(pathreader.elementType.eval(element)) {
            case 'node':
                key = pathreader.nodeKey.eval(element);
                node = _chart.getNodeAllInfo(key);
                if(node !== null) {
                    plist.push({'x': node.cola.x, 'y': node.cola.y});
                }
                break;
            case 'edge':
                break;
            }
        });

        return plist;
    };

    // convert original path data into <d>
    function parsePath(p, lineTension) {
        lineTension = lineTension || 0.6;

        function _distance(node1, node2) {
            return Math.sqrt(Math.pow((node1.x-node2.x),2) + Math.pow((node1.y-node2.y),2));
        }

        var path_coord = getNodePosition(p);

        var line = d3.svg.line()
            .interpolate("cardinal")
            .x(function(d) { return d.x; })
            .y(function(d) { return d.y; })
            .tension(lineTension);

        if(!pathprops.insertDummyNodes) {
            return line(path_coord);
        } else {
            // insert fake nodes to avoid sharp turns
            var new_path_coord = [];
            for(var i = 0; i < path_coord.length; i ++) {
                if (i-1 >= 0 && i+1 < path_coord.length) {
                    if (path_coord[i-1].x === path_coord[i+1].x &&
                        path_coord[i-1].y === path_coord[i+1].y ) {
                        // insert node when the previous and next nodes are the same
                        var x1 = path_coord[i-1].x, y1 = path_coord[i-1].y;
                        var x2 = path_coord[i].x, y2 = path_coord[i].y;
                        var dx = x1 - x2, dy = y1 - y2;

                        var v1 = dy / Math.sqrt(dx*dx + dy*dy);
                        var v2 = - dx / Math.sqrt(dx*dx + dy*dy);

                        var insert_p1 = {'x': null, 'y': null};
                        var insert_p2 = {'x': null, 'y': null};

                        var offset = 10;

                        insert_p1.x = (x1+x2)/2.0 + offset*v1;
                        insert_p1.y = (y1+y2)/2.0 + offset*v2;

                        insert_p2.x = (x1+x2)/2.0 - offset*v1;
                        insert_p2.y = (y1+y2)/2.0 - offset*v2;

                        new_path_coord.push(insert_p1);
                        new_path_coord.push(path_coord[i]);
                        new_path_coord.push(insert_p2);
                    } else if (_distance(path_coord[i-1], path_coord[i+1]) < 20){
                        // insert node when the previous and next nodes are very close
                        // first node
                        var x1 = path_coord[i-1].x, y1 = path_coord[i-1].y;
                        var x2 = path_coord[i].x, y2 = path_coord[i].y;
                        var dx = x1 - x2, dy = y1 - y2;

                        var v1 = dy / Math.sqrt(dx*dx + dy*dy);
                        var v2 = - dx / Math.sqrt(dx*dx + dy*dy);

                        var insert_p1 = {'x': null, 'y': null};

                        var offset = 10;

                        insert_p1.x = (x1+x2)/2.0 + offset*v1;
                        insert_p1.y = (y1+y2)/2.0 + offset*v2;

                        // second node
                        x1 = path_coord[i].x
                        y1 = path_coord[i].y;
                        x2 = path_coord[i+1].x
                        y2 = path_coord[i+1].y;
                        dx = x1 - x2;
                        dy = y1 - y2;

                        v1 = dy / Math.sqrt(dx*dx + dy*dy);
                        v2 = - dx / Math.sqrt(dx*dx + dy*dy);

                        var insert_p2 = {'x': null, 'y': null};

                        insert_p2.x = (x1+x2)/2.0 + offset*v1;
                        insert_p2.y = (y1+y2)/2.0 + offset*v2;

                        new_path_coord.push(insert_p1);
                        new_path_coord.push(path_coord[i]);
                        new_path_coord.push(insert_p2);

                    }
                    else {
                        new_path_coord.push(path_coord[i]);
                    }
                } else {
                    new_path_coord.push(path_coord[i]);
                }
            }
            return line(new_path_coord);
        }
    }

    // draw the spline for paths
    function drawSpline(paths, pathprops) {
        // draw spline edge
        var _chart = _behavior.parent();

        var edge = _layer.selectAll(".spline-edge").data(paths);
        var edgeEnter = edge.enter().append("svg:path")
            .attr('class', 'spline-edge')
            .attr('id', function(d, i) { return "spline-path-"+i; })
            .attr('d', function(d) { return parsePath(d, pathprops.lineTension); })
            .attr('stroke', _chart.edgeStroke() || 'black')
            .attr('stroke-width', _chart.edgeStrokeWidth() || 1)
            .attr('opacity', pathprops.edgeOpacity || 1)
            .attr('fill', 'none');

        // another wider copy of the edge just for hover events
        var edgeHover = _layer.selectAll('.spline-edge-hover')
            .data(paths);
        var edgeHoverEnter = edgeHover.enter().append('svg:path')
            .attr('class', 'spline-edge-hover')
            .attr('d', function(d) { return parsePath(d); })
            .attr('opacity', 0)
            .attr('stroke', 'green')
            .attr('stroke-width', 5)
            .attr('fill', 'none')
            .on('mouseover', function(d, i) {
                highlight_paths_group.hover_changed([paths[i]]);
             })
            .on('mouseout', function(d, i) {
                highlight_paths_group.hover_changed(null);
             })
            .on('click', function(d, i) {
                highlight_paths_group.select_changed([paths[i]]);
             });
    };

    d3.selection.prototype.moveToFront = function() {
        return this.each(function() {
            this.parentNode.appendChild(this);
        });
    };

    function draw_hovered(hoversplines) {
        if(hoversplines === null) {
            d3.selectAll('.spline-edge').attr('stroke', 'black');
        } else {
            for(var i = 0; i < hoversplines.length; i ++) {
                var path_id = pathsAll.indexOf(hoversplines[i])
                var sel_path = d3.select("#spline-path-"+path_id).attr('stroke', hoverprops.edgeStroke);
                sel_path.moveToFront();
            }
        }
    }

    function add_behavior(chart, node, edge, ehover) {

    }

    function remove_behavior(chart, node, edge, ehover) {
    }

    highlight_paths_group
        .on('hover_changed.draw-spline-paths', function(hpaths) {
            draw_hovered(hpaths);
        });

    var _behavior = dc_graph.behavior('draw-spline-paths', {
        add_behavior: add_behavior,
        remove_behavior: function(chart, node, edge, ehover) {
            remove_behavior(chart, node, edge, ehover);
            return this;
        },
        parent: function(p) {
            if(p)
                _anchor = p.anchorName();
            highlight_paths_group.on('paths_changed.' + _anchor, p ? paths_changed : null);
        }
    });

    return _behavior;
};