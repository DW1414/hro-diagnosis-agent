/* 管理员入口密钥读取器（仅供本机测试）
   优先读同目录 .ak（不入库）；种子里只有 SHA-256 哈希，不可反查，故无 .ak 时返回空 */
const fs = require('fs'), path = require('path');
module.exports = (function () {
  try {
    const s = fs.readFileSync(path.join(__dirname, '.ak'), 'utf8').trim();
    if (s) return s;
  } catch (e) { /* 无 .ak */ }
  return '';
})();
