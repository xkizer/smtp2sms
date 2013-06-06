module.exports = {
    init: function (init) {
        var steps = [],
            counter = 0,
            cb;
            
        if(init && init.length) {
            steps = init;
        }
        
        var next = function () {
            var nxt = steps[counter++];
            
            if(nxt) {
                nxt(next);
            } else {
                cb();
            }
        };
        
        steps.exec = function (callback) {
            cb = callback;
            next();
        };
        
        steps.add = steps.push;
        return steps;
    }
};
