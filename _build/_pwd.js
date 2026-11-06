/* 门禁密码读取器：真实密码放同目录 .pwd（不入库） */
const fs = require('fs'), path = require('path');
module.exports = (function () {
  try { return fs.readFileSync(path.join(__dirname, '.pwd'), 'utf8').trim(); }
  catch (e) { return ''; }
})();
