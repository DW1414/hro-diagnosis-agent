function tabDims(t){
  var h='';
  KB.aspects.forEach(function(a,ai){
    h+='<details class="fold" open><summary style="font-size:13px;color:#e8c584">'+esc(a.code+' · '+a.name)+'　'+esc(a.slogan||'')+'（'+a.items.length+' 项）</summary>';
    h+='<div style="margin-top:8px">'
      +field('方面码',a.code,'aspects.'+ai+'.code')
      +field('方面名',a.name,'aspects.'+ai+'.name')
      +field('评分表抬头 / 口号',a.slogan||'','aspects.'+ai+'.slogan')
      +'</div>';
    (a.items||[]).forEach(function(it,ii){
      var p='aspects.'+ai+'.items.'+ii+'.';
      h+='<div class="actcard"><div class="hd"><span class="t">'+esc(it.code+' '+it.name)+'</span>'
        +'<span class="tag">'+(it.families&&it.families.length?esc(it.families.join('/')):'无措施族')+'</span>'
        +'<button class="btn sm" data-act="delDim" data-arg="'+esc(it.code)+'">删除子项</button></div><div class="grid">'
        +field('子项码',it.code,p+'code')
        +field('名称',it.name,p+'name')
        +'</div>'
        +'<div class="grid" style="margin-top:8px">'
        +field('审查要点（换行分隔）',(it.reviews||[]).join('\n'),p+'reviews','ta')
        +field('证据信号（换行分隔）',(it.signals||[]).join('\n'),p+'signals','ta')
        +field('整改标签码（换行分隔）',(it.tags||[]).join('\n'),p+'tags','ta')
        +field('措施族（换行分隔，留空则出「措施待补充」）',(it.families||[]).join('\n'),p+'families','ta')
        +'</div>'
        +'<div class="grid" style="margin-top:8px">'
        +field('命中关键词（换行分隔）',(it.kw||[]).join('\n'),p+'kw','ta')
        +'</div></div>';
    });
    h+='<button class="btn sm teal" data-act="addDim" data-asp="'+esc(a.code)+'">+ 新增子项</button>';
    h+='</details>';
  });
  t.innerHTML=h;
  bindFields(t);
}
function tabScore(t){
  var h='';
  (KB.score.parts||[]).forEach(function(pt,pi){
    h+='<details class="fold" open><summary style="font-size:13px;color:#e8c584">'+esc(pt.title)+'（满分 '+pt.max+'）</summary>';
    h+='<div style="margin-top:8px">'
      +field('Part 码',pt.part,'score.parts.'+pi+'.part')
      +field('标题',pt.title,'score.parts.'+pi+'.title')
      +field('一级列名',pt.colL1||'','score.parts.'+pi+'.colL1')
      +field('依据列名',pt.colBasis||'','score.parts.'+pi+'.colBasis')
      +'</div>';
    (KB.score.rows||[]).forEach(function(r,ri){
      if(r.part!==pt.part) return;
      var p='score.rows.'+ri+'.';
      h+='<div class="actcard"><div class="hd"><span class="t">'+esc(r.id+' '+r.name)+'</span>'
        +'<span class="tag">'+esc(r.type)+'</span><span class="tag b">满分 '+r.max+'</span>'
        +'<span class="tag">'+esc(r.aspect||'')+'</span>'
        +'<button class="btn sm" data-act="delRow" data-arg="'+esc(r.id)+'">删除</button></div><div class="grid">'
        +field('ID',r.id,p+'id')
        +field('名称',r.name,p+'name')
        +field('一级维度/分类',r.l1||'',p+'l1')
        +field('所属方面',r.aspect||'',p+'aspect')
        +'</div><div class="grid" style="margin-top:8px">'
        +field('满分',r.max,p+'max','num')
        +field('类型（band/ladder_up/ladder_down/full100/qual/qual3/bonus）',r.type,p+'type')
        +field('目标值表述',r.target||'',p+'target')
        +field('备注 / 判定口径',r.hint||'',p+'hint','ta')
        +'</div><div class="grid" style="margin-top:8px">'
        +field('取值关键词（换行分隔）',(r.pat||[]).join('\n'),p+'pat','ta')
        +'</div>'
        +'<div style="margin-top:8px;font-size:12px;color:#c8d4e3">档位</div><div class="grid">';
      (r.bands||[]).forEach(function(b,bi){
        h+=field('档'+(bi+1)+' 描述',b.d,p+'bands.'+bi+'.d','ta')
         +field('档'+(bi+1)+' 触发表达式 X',b.e||'',p+'bands.'+bi+'.e')
         +field('档'+(bi+1)+' 分值',b.v==null?'':b.v,p+'bands.'+bi+'.v','v');
      });
      h+='</div></div>';
    });
    h+='<button class="btn sm teal" data-act="addRow" data-part="'+esc(pt.part)+'">+ 新增评分项</button></details>';
  });
  t.innerHTML=h;
  bindFields(t);
}
function tabTags(t){
  var h='<div class="grid">';
  KB.tags.forEach(function(x,i){
    h+=field('标签码',x.code,'tags.'+i+'.code')
     +field('简写（写入整改表维度列）',x.short,'tags.'+i+'.short')
     +field('名称',x.name,'tags.'+i+'.name')
     +field('颜色',x.color,'tags.'+i+'.color');
  });
  h+='</div><button class="btn sm teal" data-act="addTag">+ 新增标签</button>';
  t.innerHTML=h; bindFields(t);
}
function tabPrio(t){
  var U=KB.priority.urgency, M=KB.priority.matrix, ST=KB.priority.stars;
  var h='<div style="font-size:12.5px;color:#e8c584;margin-bottom:6px">紧急度信号词（换行分隔）</div><div class="grid">';
  ['高','中','低'].forEach(function(k){
    h+=field('紧急度 · '+k,(U[k]||[]).join('\n'),'priority.urgency.'+k,'ta');
  });
  h+='</div><div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">重要度星级信号词（五星最高）</div><div class="grid">';
  [5,4,3,2].forEach(function(k){
    h+=field('★★★★★'.slice(0,k)+'☆☆☆☆☆'.slice(0,5-k)+' 信号词',(ST[String(k)]||[]).join('\n'),'priority.stars.'+k,'ta');
  });
  h+='</div>';
  h+='<div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">优先级矩阵（行=紧急度，列=重要度档）</div>';
  h+='<table><thead><tr><th>紧急度 ＼ 重要度</th><th>高（★★★★☆–★★★★★）</th><th>中（★★★☆☆）</th><th>低（★☆☆☆☆–★★☆☆☆）</th></tr></thead><tbody>';
  ['高','中','低'].forEach(function(u){
    h+='<tr><th>'+u+'</th>';
    ['高','中','低'].forEach(function(i){
      h+='<td><select data-apx="priority.matrix.'+u+'.'+i+'">'
        +['P0','P1','P2','P3'].map(function(o){return '<option'+(M[u][i]===o?' selected':'')+'>'+o+'</option>';}).join('')
        +'</select></td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table>';
  h+='<div style="font-size:12.5px;color:#e8c584;margin:10px 0 6px">建议交期（天）</div><div class="grid">';
  ['P0','P1','P2','P3'].forEach(function(p){
    h+=field(p+' 交期天数',KB.priority.lead[p],'priority.lead.'+p,'num')
      +field(p+' 文案',KB.priority.leadLabel[p]||'','priority.leadLabel.'+p);
  });
  h+='</div>';
  t.innerHTML=h;
  bindFields(t);
  Array.prototype.forEach.call(t.querySelectorAll('[data-apx]'),function(el){
    el.addEventListener('change',function(){ ap(this.getAttribute('data-apx'),this.value); });
  });
}
