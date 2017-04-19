var idFactory = (function() {
		var id = 0;
		return function() {
			return ++id;
		}
	})();
function maxRequestIdManager() {
	var MaxRequestIdMap;
    var MaxRequestIdManager = {//组件最大请求id管理器，主要管理对于组件发出的多个请求中，哪个请求的返回结果是需要的结果，最后发出的请求才是需要的结果。
        initMaxRequestId: function() {
            MaxRequestIdMap = {};//初始化记录组件最大请求id的变量
        },
        addMaxRequestId: function(id) {
            if (MaxRequestIdMap[id] === undefined) {
                MaxRequestIdMap[id]= 1;
            }
            else {
                MaxRequestIdMap[id]++;
            }
            return this;
        },
        getMaxRequestId: function(id) {//获取某个组件的最大请求id，主要在请求时和结果返回时需要使用
            return MaxRequestIdMap[id];
        }
    };
    return MaxRequestIdManager;
}

function statusManager() {
	var _statusMap;
    var _count;
    var _constantCount;
    var _callback;
    var statusManager = {//组件状态管理器，主要管理组件是否处于可以校验的状态，不处于校验状态的组件理论上都是可以提交的，内容的合法性交给提交时校验
        initStatus: function(config) {//初始化组件的状态，默认为可提交，因为初始化时组件处于非校验状态
            var hasOwnProperty = Object.prototype.hasOwnProperty;
            var status = config.status;//组件的默认状态
            _statusMap = {};
            _constantCount = config.length;//组件个数，主要用于判断是否每个组件都已经处于可用状态
            _callback = config.callback;//每个组件都可用时需要执行的回调
            _count = 0;//记录默认情况下处于可用状态的组件个数
            for (var key in status) {//深复制,使得初始化后组件状态不受status的影响
                if (hasOwnProperty.call(status,key)) {
                    _statusMap[key] = !!status[key];
                    if (_statusMap[key]) {//组件默认状态为true则可用组件数加一
                        _count++;
                    }
                }
            }
        },
        disableStatus: function(id) {
            if (_statusMap[id] !== undefined && _statusMap[id]) {//对同一个组件连续发出多次校验时进行优化
                _count--;//只有状态变更才会引起count值的变化
                _statusMap[id] = false;
            }
        },
        /*优化，校验完毕后状态是true，如果把组件的内容置空，则不需要再进行处理，因为只有状态转换时才会引起提交按钮状态的改变
        如果该次为true时，系统还有一个请求没有返回，则不可提交，如果第二次走到这里，该组件的状态还是true那么不需要再进行处理，因为是否把按钮置为可提交的状态是取决于那个剩余的请求有没有返回。再次判断也不会影响提交按钮的状态
        如果该次为true时，全部请求已经返回，则提交按钮可用，下次再判断也是true，则不需要处理。*/
        enableStatus: function(id) {
            if (_statusMap[id] !== undefined && !_statusMap[id]) {
                _count++;
                _statusMap[id] = true;
                this.checkStatus();//判断是不是最后一个组件变为可用了，是的话需要执行回调
            }
        },
        getFinalStatus: function() {
            return _count === _constantCount;//判断是否所有组件都处于可用状态了
        },
        getStatus: function(id) {//获取组件的状态
            return id ? _statusMap[id] : _statusMap;
        },
        checkStatus: function() {//判断组件的状态，都可用则执行回调
            if (_count === _constantCount) {
                _callback && (Object.prototype.toString.call(_callback) === '[object Function]') && _callback();
            }
        }
    };
    return statusManager;
}

function commomRequestTimesManager(){
	var _commomRequestTimes;
    var _callback;
    var commomRequestTimesManager = {//通用的请求管理器，主要是管理富文本中上传图片和附件的请求
        initCommomRequestTimes: function(callback) {
            _commomRequestTimes = 0;
            _callback = callback;//请求都已经返回时需要执行的回调
        },
        addCommomRequestTimes: function() {
            _commomRequestTimes++;//请求数加一
        },
        subCommomRequestTimes: function() {
            _commomRequestTimes--;//请求结果返回，请求数减一
            this.checkCommomRequestTimes();//每次请求返回时需要判断是否是最后一次结果已经返回，即_commomRequestTimes等于0，如果是则执行回调
        },
        getCommomRequestTimes: function() {
            return _commomRequestTimes;//获取当前的请求总数
        },
        checkCommomRequestTimes: function() {//判断所有请求是否已经返回，是的就执行回调
            if(_commomRequestTimes === 0 ) {
                _callback && (Object.prototype.toString.call(_callback) === '[object Function]') && _callback();
            }
        }
    } 
    return commomRequestTimesManager;
}
function Checker(options) {
	this.cached = {};
	this.eleMap = {};
	this.commomRequestTimesManager = commomRequestTimesManager();
    this.maxRequestIdManager = maxRequestIdManager();
    this.statusManager = statusManager();
    this.init(options);
}

Checker.prototype = {
	constructor: Checker,
	init: function(options) {
		var self = this;
		this.bindEvent(options);
		this.statusManager.initStatus(this.getComponentStatus());//初始化组件的状态，默认是可提交
        this.commomRequestTimesManager.initCommomRequestTimes(function() {
            if(self.statusManager.getFinalStatus()) {
                console.log('提交工单');
            }
        });//初始化全局的请求次数
        this.maxRequestIdManager.initMaxRequestId();//初始化最大请求id对象
	},
	bindEvent: function(options) {
		var self = this;
		$(options.items).each(function(index, item) {
			var id = idFactory();
			var target = $(item.ele);
			if (!target.length) {
				return;
			}
			target.attr('_itemId', id);
			self.eleMap[id] = item;
            
			target.on('blur', function(e) {
				var data = {};
                var currentTarget = $(e.target);
                var id = currentTarget.attr('_itemId');
                var value = currentTarget.val();
                var item = self.eleMap[id];
                if (item.beforeCheck && !item.beforeCheck.call(self, value)) {
                	return;
                }
                if (item.cached && self.cached[id] && self.cached[id][value]) {
                	return item.cb(self.cached[id][value]);
                }
				data[item.key || 'val'] = value;
                self.statusManager.disableStatus(id);//把组件置为不可提交状态
                var currentMaxRequestId = self.maxRequestIdManager.addMaxRequestId(id).getMaxRequestId(id);
				self.commomRequestTimesManager.addCommomRequestTimes();//请求次数加一
                var callback =  function(id, currentMaxRequestId, resp) {
                		this.commomRequestTimesManager.subCommomRequestTimes();//请求次数加一
                        if (currentMaxRequestId !=  this.maxRequestIdManager.getMaxRequestId(id)) {
                            return;
                        }
                        this.statusManager.enableStatus(id);
                        if (self.cached[id]) {
                        	self.cached[id][value] = resp;
                        } else {
                        	self.cached[id] = {};
                        	self.cached[id][value] = resp;
                        }
                        item.cb(resp); 
                    };
				$.ajax({
					url: item.url,
					type: options.type || 'post',
					data: data,
					success: callback.bind(self, id, currentMaxRequestId),
					error: callback.bind(self, id, currentMaxRequestId, {code: -10000, errMsg: '网络出错'})
				})
			})
		})
	},
	getComponentStatus: function() {
        var components = $('[_itemId]');
        var statusMap = {};
        var result;
        var self = this;
        components.each(function(index,value) {
            var key = $(value).attr('_itemId');
            statusMap[key] = true;
        });
        result = {
            length: components.length,
            status: statusMap,
            callback: function() {
                if(self.commomRequestTimesManager.getCommomRequestTimes() === 0) {
                    console.log('提交工单')
                }
            }
        };
        return result;
    }
}

window.Checker = Checker;




