function port_name(nodeId, edgeId, portName) {
    return (nodeId ? 'node/' + nodeId : 'edge/' + edgeId) + '/' + portName;
};
function split_port_name(portname) {
    var parts = portname.split('/');
    if(parts[0] === 'node')
        return {
            nodeKey: parts[1],
            name: parts[2]
        };
    else return {
        edgeKey: parts[1],
        name: parts[2]
    };
}

dc_graph.place_ports = function(diagram, nodes, wnodes, edges, wedges, ports, wports) {
    var node_ports = {};

    // assemble port-lists for nodes, again because we don't have a metagraph.
    wports.forEach(function(p) {
        var nid = diagram.nodeKey.eval(p.node);
        var np = node_ports[nid] = node_ports[nid] || [];
        np.push(p);
    });

    function norm(v) {
        var c = Math.hypot(v.dx, v.dy);
        return {
            dx: v.dx / c,
            dy: v.dy / c
        };
    }
    function vec(n, e) {
        var dy = e.target.cola.y - e.source.cola.y,
            dx = e.target.cola.x - e.source.cola.x;
        if(e.source !== n)
            dy = -dy, dx = -dx;
        return norm({dy: dy, dx: dx});
    }
    function angle(v) {
        var dp = dpos(n, e);
        return Math.atan2(v.dy, v.dx);
    }
    function clip_angle(theta, a, b) {
        if(Math.abs(normalize_angle(theta - a)) <
           Math.abs(normalize_angle(theta - b)))
            return a;
        else
            return b;
    }

    // calculate port positions (currently very stupid)
    for(var nid in node_ports) {
        var n = nodes[nid],
            nports = node_ports[nid];
        nports.forEach(function(p) {
            var angs = p.edges.map(vec.bind(null, n));
            p.vec = angs.length ? {
                dx: d3.sum(angs, function(v) { return v.dx; })/angs.length,
                dy: d3.sum(angs, function(v) { return v.dy; })/angs.length
            }
                : p.theta || undefined;
            if(p.orig) { // only specified ports have bounds
                var bounds = diagram.portBounds.eval(p);
                if(bounds)
                    p.bounds = bounds.map(normalize_angle);
            }
        });
        var inside = [], outside = [], unplaced = [];
        nports.forEach(function(p) {
            if(p.theta === undefined)
                unplaced.push(p);
            else if(p.bounds && !between_angles(p.theta, p.bounds[0], p.bounds[1]))
               outside.push(p);
            else
                inside.push(p);
        });
        // for now, just shunt outside ports into their bounds and then place unplaced
        // would like to use 1D force directed here
        outside.forEach(function(p) {
            p.theta = clip_angle(p.theta, p.bounds[0], p.bounds[1]);
            inside.push(p);
        });
        inside.sort(function(a,b) {
            return d3.ascending(a.theta, b.theta);
        });
        // place the rest randomly within their bounds
        unplaced.forEach(function(p) {
            var low, high;
            if(p.bounds) {
                low = p.bounds[0];
                high = p.bounds[1];
            } else {
                low = -Math.PI;
                high = Math.PI;
            }
            p.theta = normalize_angle(low + Math.random()*normalize_angle_delta(high-low));
        });
        nports.forEach(function(p) {
            p.pos = point_on_shape(diagram, nodes[nid], Math.cos(p.theta)*1000, Math.sin(p.theta)*1000);
        });
    }

    // propagate port positions to edge endpoints
    wedges.forEach(function(e) {
        var name = diagram.edgeSourcePortName.eval(e);
        e.sourcePort.pos = name ? ports[port_name(diagram.nodeKey.eval(e.source), null, name)].pos :
            ports[port_name(null, diagram.edgeKey.eval(e), 'source')].pos;
        name = diagram.edgeTargetPortName.eval(e);
        e.targetPort.pos = name ? ports[port_name(diagram.nodeKey.eval(e.target), null, name)].pos :
            ports[port_name(null, diagram.edgeKey.eval(e), 'target')].pos;
    });
    return node_ports;
};
