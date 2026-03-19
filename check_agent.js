// 测试 https-proxy-agent@5 的 require 方式
var pkg = require('./node_modules/https-proxy-agent/package.json');
console.log('version:', pkg.version, 'main:', pkg.main);

var HPA = require('https-proxy-agent');
console.log('exports:', Object.keys(HPA));
