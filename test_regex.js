const prefix = 'NF-B-20260228';
const r1 = new RegExp(`^${prefix}-\\d+$`);
console.log(r1);
console.log(r1.test('NF-B-20260228-00001'));
