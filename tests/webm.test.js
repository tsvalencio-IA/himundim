const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),child=require('node:child_process'),W=require('../radio-webm');
test('compressed Opus editing removes packets, preserves decoding and writes the shortened duration',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'himundim-edit-'));try{
  const input=path.join(folder,'original.webm'),output=path.join(folder,'edited.webm');
  child.execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=6','-c:a','libopus',input]);
  const blob=await W.edit(new Blob([fs.readFileSync(input)],{type:'audio/webm'}),[{start:1,end:2},{start:3,end:4}],6);fs.writeFileSync(output,Buffer.from(await blob.arrayBuffer()));
  const duration=Number(child.execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'}));assert.ok(Math.abs(duration-4)<0.03);assert.ok(fs.statSync(output).size<fs.statSync(input).size);child.execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
