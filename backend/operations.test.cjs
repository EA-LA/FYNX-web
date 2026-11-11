const {test}=require('node:test');const assert=require('node:assert/strict');const {_test:{sanitize}}=require('./operations');
test('operational events exclude user content, URLs, and unknown codes',()=>{
 const result=sanitize({category:'upload',operation:'photo-upload',code:'my-private-file.jpg',page:'/profile.html?email=secret@example.com',email:'secret@example.com',message:'password',filename:'private.jpg'});
 assert.deepEqual(result,{category:'upload',operation:'photo-upload',code:'unknown',page:'unknown'});
});
test('operation category is enforced and known error codes survive',()=>{
 assert.equal(sanitize({category:'auth',operation:'photo-upload'}),null);
 assert.deepEqual(sanitize({category:'save',operation:'journal-save',code:'permission-denied',page:'/journal.html'}),{category:'save',operation:'journal-save',code:'permission-denied',page:'/journal.html'});
});
