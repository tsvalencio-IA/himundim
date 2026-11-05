(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HimundimWebM=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function element(bytes,offset){
    if(offset>=bytes.length)return null;
    let idLength=1,mask=128;while(idLength<=4&&!(bytes[offset]&mask)){idLength++;mask>>=1;}if(idLength>4)throw new Error('Cabeçalho WebM inválido.');
    let id=0;for(let i=0;i<idLength;i++)id=id*256+bytes[offset+i];
    const sizeStart=offset+idLength;let sizeLength=1;mask=128;while(sizeLength<=8&&!(bytes[sizeStart]&mask)){sizeLength++;mask>>=1;}if(sizeLength>8)throw new Error('Tamanho WebM inválido.');
    let size=bytes[sizeStart]&(mask-1),unknown=size===mask-1;for(let i=1;i<sizeLength;i++){size=size*256+bytes[sizeStart+i];unknown=unknown&&bytes[sizeStart+i]===255;}
    const start=sizeStart+sizeLength,end=unknown?bytes.length:Math.min(bytes.length,start+size);if(start>bytes.length||end<start)throw new Error('Gravação WebM incompleta.');return{id,offset,start,end};
  }
  function elements(bytes,start,end){const result=[];let offset=start;while(offset<end){const item=element(bytes,offset);if(!item||item.end<=offset)break;result.push(item);offset=item.end;}return result;}
  function concat(parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;parts.forEach(p=>{result.set(p,offset);offset+=p.length;});return result;}
  function size(value){for(let length=1;length<=8;length++){if(value<2**(7*length)-1){const result=new Uint8Array(length);let n=value;for(let i=length-1;i>=0;i--){result[i]=n%256;n=Math.floor(n/256);}result[0]|=1<<(8-length);return result;}}throw new Error('Arquivo muito grande.');}
  function wrap(id,body){return concat([new Uint8Array(id),size(body.length),body]);}
  function uint(bytes,start,end){let n=0;for(let i=start;i<end;i++)n=n*256+bytes[i];return n;}
  function unsigned(value){let n=Math.round(value),length=1;while(n>=256**length)length++;const out=new Uint8Array(length);for(let i=length-1;i>=0;i--){out[i]=n%256;n=Math.floor(n/256);}return out;}
  async function edit(blob,cutList,total){
    const raw=new Uint8Array(await blob.arrayBuffer()),top=elements(raw,0,raw.length),segment=top.find(el=>el.id===0x18538067),header=top.find(el=>el.id===0x1a45dfa3);
    if(!segment||!header)throw new Error('Este formato não permite cortes sem reconversão. Grave em WebM no Chrome para publicar cortes.');
    const nodes=elements(raw,segment.start,segment.end),info=nodes.find(el=>el.id===0x1549a966),tracks=nodes.find(el=>el.id===0x1654ae6b);if(!info||!tracks)throw new Error('A gravação não contém trilhas WebM completas.');
    const infoNodes=elements(raw,info.start,info.end),scaleNode=infoNodes.find(el=>el.id===0x2ad7b1),scale=scaleNode?uint(raw,scaleNode.start,scaleNode.end):1000000;
    const cuts=(Array.isArray(cutList)?cutList:[]).sort((a,b)=>a.start-b.start);
    const included=t=>!cuts.some(cut=>t>=cut.start&&t<cut.end);
    const mapped=t=>t-cuts.reduce((n,cut)=>n+Math.max(0,Math.min(t,cut.end)-cut.start),0);
    const duration=new Uint8Array(8);new DataView(duration.buffer).setFloat64(0,mapped(total)*1e9/scale,false);
    const newInfo=wrap([0x15,0x49,0xa9,0x66],concat([...infoNodes.filter(el=>el.id!==0x4489&&el.id!==0xbf).map(el=>raw.subarray(el.offset,el.end)),wrap([0x44,0x89],duration)]));
    const output=[raw.subarray(header.offset,header.end),new Uint8Array([0x18,0x53,0x80,0x67,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff]),newInfo,raw.subarray(tracks.offset,tracks.end)];let blocks=0;
    for(const cluster of nodes.filter(el=>el.id===0x1f43b675)){
      const children=elements(raw,cluster.start,cluster.end),stamp=children.find(el=>el.id===0xe7),base=stamp?uint(raw,stamp.start,stamp.end):0;let clusterTime=null,parts=[];
      const flush=()=>{if(parts.length){output.push(wrap([0x1f,0x43,0xb6,0x75],concat([wrap([0xe7],unsigned(clusterTime)),...parts])));parts=[];}};
      for(const block of children){
        const group=block.id===0xa0?elements(raw,block.start,block.end):null;
        const packet=group?group.find(el=>el.id===0xa1):block;
        if(!packet||(!group&&block.id!==0xa3))continue;
        const payload=raw.subarray(packet.start,packet.end);let trackLength=1,mask=128;while(trackLength<=8&&!(payload[0]&mask)){trackLength++;mask>>=1;}
        if(trackLength>8||payload.length<trackLength+3)throw new Error('Bloco de áudio inválido.');
        const relative=new DataView(payload.buffer,payload.byteOffset+trackLength,2).getInt16(0,false),source=(base+relative)*scale/1e9;
        if(!included(source))continue;
        const next=Math.max(0,Math.round(mapped(source)*1e9/scale));
        if(clusterTime===null)clusterTime=next;
        if(next-clusterTime>32767||next<clusterTime){flush();clusterTime=next;}
        const changed=new Uint8Array(payload);new DataView(changed.buffer).setInt16(trackLength,next-clusterTime,false);const rebuilt=wrap([group?0xa1:0xa3],changed);parts.push(group?wrap([0xa0],concat([rebuilt,...group.filter(el=>el.id!==0xa1&&el.id!==0xbf).map(el=>raw.subarray(el.offset,el.end))])):rebuilt);blocks++;
      }
      flush();
    }
    if(!blocks)throw new Error('Nenhum áudio restou após os cortes.');
    return new Blob(output,{type:'audio/webm'});
  }
  return {edit,element,elements};
});
