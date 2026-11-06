/* 管理员入口密钥读取器：直接从种子/产物正则提取，仓库内不存明文 */
const fs = require('fs'), path = require('path');
module.exports = (function () {
  const cands = [
    path.join(__dirname, '01_seed.js'),
    path.join(__dirname, '..', 'ops-diagnosis-agent.html')
  ];
  for (const f of cands) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/"adminKey"\s*:\s*"([^"]*)"/);
      if (m && m[1]) return m[1];
    } catch (e) { /* 换下一个候选 */ }
  }
  return '';
})();
