const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rules=JSON.parse(fs.readFileSync(require.resolve('../docs/firebase-database.rules.json'),'utf8')).rules;
const uid='listener',admin='C19UZ7R1OSRaAGZ3XSXfBFaUzMD2',now=1000000;
function snap(value,parent=null){return{val:()=>value??null,exists:()=>value!=null,parent:()=>parent,child(path){let node=this;for(const key of path.split('/'))node=snap(node.val()?.[key],node);return node;},hasChildren(keys){return keys.every(k=>value?.[k]!=null);},isString:()=>typeof value==='string',isNumber:()=>typeof value==='number',isBoolean:()=>typeof value==='boolean'};}
function evaluate(expression,values={}){return new Function('auth','data','newData','root','now','$uid','$messageId','return ('+expression+');')({uid},snap(null),snap(null),snap({}),now,uid,'message',...[]);}
function run(expression,{authUid=uid,data=null,newData=null,root={},pathUid=uid}={}){return new Function('auth','data','newData','root','now','$uid','return ('+expression+');')(authUid?{uid:authUid}:null,snap(data),newData?.val?newData:snap(newData),snap(root),now,pathUid);}
const inbox=rules.himundimMessages,own=inbox.$uid,message=own.messages.$messageId;
test('private participation is outside the publicly readable radio tree and only admin or its author can read it',()=>{
 assert.equal(rules.radio['.read'],true);assert.ok(!rules.radio.himundim.messages);assert.equal(run(inbox['.read']),false);assert.equal(run(inbox['.read'],{authUid:admin}),true);assert.equal(run(own['.read']),true);assert.equal(run(own['.read'],{authUid:'stranger'}),false);assert.equal(run(own['.read'],{authUid:null}),false);
});
test('only the author can create a participation; ownership, interval and create-only writes are enforced',()=>{
 const newData={uid,name:'Ouvinte',city:'Rio Preto',text:'Recado',createdAt:now,status:'new'},tree={himundimMessages:{[uid]:{lastSentAt:now-16000}}};
 assert.equal(run(message['.write'],{newData,root:tree}),true);assert.equal(run(message['.write'],{authUid:'stranger',newData,root:tree}),false);assert.equal(run(message['.write'],{newData,data:newData,root:tree}),false);assert.equal(run(message['.write'],{newData,root:{himundimMessages:{[uid]:{lastSentAt:now-5000}}}}),false);
 assert.equal(run(own.lastSentAt['.validate'],{data:now-16000,newData:now}),true);assert.equal(run(own.lastSentAt['.validate'],{data:now-5000,newData:now}),false);
});
test('message validation requires atomic timestamp update, bounded text and prevents forged replies/status',()=>{
 const value={uid,name:'Ouvinte',text:'Recado',createdAt:now,status:'new'},tree=snap({lastSentAt:now,messages:{message:value}}),node=tree.child('messages/message');
 assert.equal(run(message['.validate'],{newData:node}),true);assert.equal(run(message['.validate'],{newData:snap({lastSentAt:now-16000,messages:{message:value}}).child('messages/message')}),false);
 assert.equal(run(message.text['.validate'],{newData:'a'.repeat(1501)}),false);assert.equal(run(message.name['.validate'],{newData:''}),false);assert.equal(run(message.status['.validate'],{newData:'onair'}),false);assert.equal(run(message.status['.validate'],{newData:'onair',authUid:admin}),true);assert.equal(run(message.reply['.validate'],{newData:'Fake reply'}),false);assert.equal(message.$other['.validate'],false);
});
