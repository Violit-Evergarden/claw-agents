const sig = 'c6a958bf8879c55351edcea0fa33eef39f05bfbbefeaf739920d0ba0d71c81e1183219d5e3d8bfe77148ba6023fcc0c0b3837397eb1107031f23955542b75102';
console.log('signature length:', sig.length, '(should be 128)');
console.log('missing chars:', 128 - sig.length);

// 问题就在这里：Buffer.toString('hex') 不会补前导零
// 如果签名字节里有 0x0c 这样的字节，hex 会输出 'c' 而不是 '0c'
// 需要用 padStart(128, '0') 或用其他方式确保每字节都是2位hex

// 模拟：假设正确签名是 128 位，前面补零
const padded = sig.padStart(128, '0');
console.log('padded sig:', padded);
console.log('padded length:', padded.length);
