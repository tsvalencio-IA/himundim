(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HimundimReplay=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function cuts(value,duration=Infinity){
    const rows=(Array.isArray(value)?value:[]).map(v=>({start:Math.max(0,Number(v.start)||0),end:Math.min(duration,Number(v.end)||0)})).filter(v=>Number.isFinite(v.start)&&Number.isFinite(v.end)&&v.end>v.start).sort((a,b)=>a.start-b.start);
    const merged=[]; rows.forEach(v=>{const previous=merged[merged.length-1];if(previous&&v.start<=previous.end)previous.end=Math.max(previous.end,v.end);else merged.push({...v});});return merged;
  }
  function duration(total,value){return Math.max(0,total-cuts(value,total).reduce((sum,v)=>sum+v.end-v.start,0));}
  function editedTime(source,value){let removed=0;for(const v of cuts(value)){if(source>=v.end)removed+=v.end-v.start;else if(source>v.start){removed+=source-v.start;break;}else break;}return Math.max(0,source-removed);}
  function sourceTime(edited,value,total=Infinity){let source=Math.max(0,Number(edited)||0);for(const v of cuts(value,total)){if(source>=v.start)source+=v.end-v.start;else break;}return Math.min(total,source);}
  function nextTime(source,value,total=Infinity){for(const v of cuts(value,total)){if(source>=v.start-0.015&&source<v.end)return v.end;}return source;}
  function cueAt(value,time,now=Date.now(),seek=0){
    const cues=(Array.isArray(value)?value:[]).filter(v=>Number(v.at)<=time).sort((a,b)=>Number(a.at)-Number(b.at));
    const cue=cues[cues.length-1],m=cue?.media;if(!m?.active)return null;
    return {...m,sessionId:'replay',positionSec:Math.max(0,Number(m.positionSec)||0)+(m.playing?Math.max(0,time-Number(cue.at)):0),startedAt:now,command:m.playing?'SEEK':'PAUSE',commandSeq:String(cue.at)+':'+seek};
  }
  function trimCues(value,cutList,total){
    const removed=cuts(cutList,total),kept=[];let start=0;
    removed.forEach(cut=>{if(cut.start>start)kept.push({start,end:cut.start});start=cut.end;});if(start<total)kept.push({start,end:total});
    const result=[];
    kept.forEach(range=>{
      const initial=cueAt(value,range.start,0),media=initial?{...initial,startedAt:0}:{active:false};
      result.push({at:editedTime(range.start,removed),media});
      (Array.isArray(value)?value:[]).filter(cue=>cue.at>range.start&&cue.at<range.end).forEach(cue=>result.push({...cue,at:editedTime(cue.at,removed)}));
    });return result;
  }
  function time(value){const seconds=Math.max(0,Math.floor(Number(value)||0));return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(v=>String(v).padStart(2,'0')).join(':');}
  function parse(value){const parts=String(value||'').trim().split(':');if(!parts.length||parts.length>3||parts.some(v=>!/^\d+(\.\d+)?$/.test(v)))return NaN;return parts.reduce((n,v)=>n*60+Number(v),0);}
  return {cuts,duration,editedTime,sourceTime,nextTime,cueAt,trimCues,time,parse};
});
