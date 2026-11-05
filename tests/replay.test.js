const test=require('node:test'),assert=require('node:assert/strict'),R=require('../radio-replay');
test('overlapping cuts merge and every edited time maps back to the same playable source position',()=>{
 const cuts=R.cuts([{start:10,end:20},{start:15,end:30},{start:0,end:2},{start:60,end:100}],80);assert.deepEqual(cuts,[{start:0,end:2},{start:10,end:30},{start:60,end:80}]);assert.equal(R.duration(80,cuts),38);
 for(const time of [0,1,7,8,9,20,37])assert.equal(R.editedTime(R.sourceTime(time,cuts,80),cuts),time);
 assert.equal(R.nextTime(16,cuts,80),30);assert.equal(R.nextTime(35,cuts,80),35);
});
test('YouTube resumes at the correct original video time after a cut and keeps a paused video paused',()=>{
 const cues=[{at:0,media:{active:true,videoId:'M7lc1UVf-VE',playing:true,positionSec:5}},{at:25,media:{active:true,videoId:'M7lc1UVf-VE',playing:false,positionSec:30}},{at:45,media:{active:false}}];
 const trimmed=R.trimCues(cues,[{start:10,end:20},{start:30,end:40}],50);
 assert.equal(R.cueAt(trimmed,10,1000).positionSec,25);assert.equal(R.cueAt(trimmed,15,1000).playing,false);assert.equal(R.cueAt(trimmed,20,1000).positionSec,30);assert.equal(R.cueAt(trimmed,26),null);
});
test('time inputs reject text, invalid structure and support hours and fractions',()=>{assert.equal(R.parse('01:02:03.5'),3723.5);assert.ok(Number.isNaN(R.parse('ao vivo')));assert.equal(R.time(3723),'01:02:03');});
