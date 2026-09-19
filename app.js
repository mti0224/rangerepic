(function () {
  "use strict";

  var REPO_BASE = "https://raw.githubusercontent.com/mti0224/rangerbook_res/main/";
  var PART_CANDIDATE_SUFFIXES = ["", ".16"];

  var units = {
    "u1138e-james": { id:"u1138e-james", name:"James", role:"守護者", hp:1500, atk:150, skill:"堅毅衝鋒", skillDesc:"造成 150% 傷害並獲得護盾", type:"ally", visualScale:.96 },
    "u1137e-cony": { id:"u1137e-cony", name:"Cony", role:"決鬥者", hp:1050, atk:235, skill:"心動連擊", skillDesc:"造成 190% 單體傷害", type:"ally", visualScale:.94 },
    "u1136e-moon": { id:"u1136e-moon", name:"Moon", role:"魔導士", hp:900, atk:270, skill:"月影爆破", skillDesc:"對所有敵人造成 95% 傷害", type:"ally", visualScale:.98 },
    "u1134e-brown": { id:"u1134e-brown", name:"Brown", role:"鬥士", hp:1320, atk:195, skill:"熊熊重擊", skillDesc:"造成 140% 傷害，有機會使敵人暈眩", type:"ally", visualScale:1.02 },
    "u2032e-jessica": { id:"u2032e-jessica", name:"Jessica", role:"治療師", hp:980, atk:135, skill:"甜蜜鼓舞", skillDesc:"恢復全隊 28% 最大生命", type:"ally", visualScale:.95 },
    "u2034e-sally": { id:"u2034e-sally", name:"Sally", role:"支援者", hp:930, atk:165, skill:"黃金羽翼", skillDesc:"全隊下次攻擊提升 35%", type:"ally", visualScale:.92 },

    "u91005-nut": { id:"u91005-nut", name:"Nut", role:"斥候", hp:680, atk:125, type:"enemy", visualScale:.90 },
    "u91007-abby": { id:"u91007-abby", name:"Abby", role:"弓手", hp:780, atk:150, type:"enemy", visualScale:.94 },
    "u91025-jerome": { id:"u91025-jerome", name:"Jerome", role:"衛兵", hp:1100, atk:145, type:"enemy", visualScale:1.00 },
    "u91003-bomby": { id:"u91003-bomby", name:"Bomby", role:"爆破手", hp:940, atk:205, type:"enemy", visualScale:1.02 },
    "u91018-aron": { id:"u91018-aron", name:"Aron", role:"術士", hp:1120, atk:185, type:"enemy", visualScale:1.00 },
    "u91022-thor": { id:"u91022-thor", name:"Thor", role:"雷神首領", hp:2200, atk:230, type:"enemy", visualScale:1.12 }
  };

  var allyIds = ["u1138e-james","u1137e-cony","u1136e-moon","u1134e-brown","u2032e-jessica","u2034e-sally"];

  var stages = [
    { n:1, name:"草原入口", enemies:["u91005-nut","u91007-abby"], x:7, y:62 },
    { n:2, name:"斷橋伏擊", enemies:["u91025-jerome","u91005-nut","u91007-abby"], x:24, y:40 },
    { n:3, name:"爆彈工坊", enemies:["u91003-bomby","u91025-jerome"], x:43, y:58 },
    { n:4, name:"幽影坡道", enemies:["u91018-aron","u91007-abby","u91003-bomby"], x:60, y:33 },
    { n:5, name:"雷鳴前線", enemies:["u91018-aron","u91025-jerome","u91003-bomby"], x:76, y:53 },
    { n:6, name:"雷神要塞", enemies:["u91022-thor","u91018-aron"], x:88, y:27, boss:true }
  ];

  var selectedParty = ["u1138e-james","u1137e-cony","u1136e-moon"];
  var animators = new Map();
  var battle = null;

  function el(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function thumbUrl(id) { return REPO_BASE + id + "/" + id + "-thum.png"; }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.classList.toggle("active", screen.id === id);
    });
  }

  document.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () { showScreen(button.getAttribute("data-go")); });
  });

  function renderHeroStrip() {
    var heroIds = ["u1137e-cony","u1138e-james","u1136e-moon"];
    el("hero-strip").innerHTML = heroIds.map(function (id) {
      return '<img src="' + thumbUrl(id) + '" alt="' + units[id].name + '">';
    }).join("");
  }

  function renderRoster() {
    el("roster").innerHTML = allyIds.map(function (id) {
      var unit = units[id];
      var selected = selectedParty.indexOf(id) >= 0;
      return '<button class="roster-card ' + (selected ? "selected" : "") + '" data-unit="' + id + '">' +
        '<img src="' + thumbUrl(id) + '" alt="">' +
        '<span><strong>' + unit.name + '</strong><span>' + unit.role + ' · HP ' + unit.hp + '</span></span>' +
      '</button>';
    }).join("");

    document.querySelectorAll(".roster-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var id = card.getAttribute("data-unit");
        var index = selectedParty.indexOf(id);
        if (index >= 0) {
          if (selectedParty.length <= 1) return;
          selectedParty.splice(index, 1);
        } else {
          if (selectedParty.length >= 3) selectedParty.shift();
          selectedParty.push(id);
        }
        renderRoster();
        renderPartySlots();
      });
    });
  }

  function renderPartySlots() {
    var slots = [0,1,2].map(function (index) {
      var id = selectedParty[index];
      if (!id) return '<div class="party-slot empty"></div>';
      return '<div class="party-slot"><img src="' + thumbUrl(id) + '" alt=""><small>' + units[id].name + '</small></div>';
    });
    el("party-slots").innerHTML = slots.join("");
    el("party-count").textContent = selectedParty.length + " / 3";
  }

  function renderStages() {
    el("stage-path").innerHTML = stages.map(function (stage) {
      return '<button class="stage-node ' + (stage.boss ? "boss" : "") + '" style="left:' + stage.x + '%;top:' + stage.y + '%" data-stage="' + stage.n + '">' +
        '<span>' + (stage.boss ? "★" : stage.n) + '</span><small>' + stage.name + '</small>' +
      '</button>';
    }).join("");
    document.querySelectorAll(".stage-node").forEach(function (node) {
      node.addEventListener("click", function () {
        if (selectedParty.length !== 3) {
          alert("請先選擇 3 名 Rangers。");
          return;
        }
        startBattle(Number(node.getAttribute("data-stage")));
      });
    });
  }

  el("start-button").addEventListener("click", function () {
    renderRoster();
    renderPartySlots();
    renderStages();
    showScreen("map-screen");
  });

  el("leave-battle").addEventListener("click", function () {
    stopAllAnimators();
    showScreen("map-screen");
  });

  el("result-button").addEventListener("click", function () {
    el("result-modal").classList.add("hidden");
    stopAllAnimators();
    showScreen("map-screen");
  });

  function DataReader(buffer) {
    this.view = new DataView(buffer);
    this.pos = 0;
  }
  DataReader.prototype.u8 = function () { var v = this.view.getUint8(this.pos); this.pos += 1; return v; };
  DataReader.prototype.u16 = function () { var v = this.view.getUint16(this.pos, true); this.pos += 2; return v; };
  DataReader.prototype.i16 = function () { var v = this.view.getInt16(this.pos, true); this.pos += 2; return v; };
  DataReader.prototype.i32 = function () { var v = this.view.getInt32(this.pos, true); this.pos += 4; return v; };
  DataReader.prototype.str = function () {
    var len = this.u16();
    var bytes = new Uint8Array(this.view.buffer, this.pos, len);
    this.pos += len;
    return new TextDecoder("ascii").decode(bytes);
  };

  function parseSam(buffer) {
    var r = new DataReader(buffer);
    var TWIPS = 20;
    var Q16 = 65536;
    var FF_REMOVES = 1, FF_ADDS = 2, FF_MOVES = 4, FF_FRAME_NAME = 8;
    var MF_ROTATE = 0x4000, MF_COLOR = 0x2000, MF_MATRIX = 0x1000, MF_LONGCOORDS = 0x0800;
    if (r.i32() !== 0x2E53414D) throw new Error("Bad SAM magic");
    if (r.i32() !== 1) throw new Error("Unsupported SAM version");

    var out = {
      anim_rate: r.u8(),
      canvas: { x:r.i32()/TWIPS, y:r.i32()/TWIPS, w:r.i32()/TWIPS, h:r.i32()/TWIPS },
      images: [],
      animations: {}
    };

    var imageCount = r.i16();
    for (var i=0; i<imageCount; i++) {
      out.images.push({
        name:r.str(),
        w:r.i16(),
        h:r.i16(),
        m:[
          r.i32()/(Q16*TWIPS), r.i32()/(Q16*TWIPS),
          r.i32()/(Q16*TWIPS), r.i32()/(Q16*TWIPS),
          r.i16()/TWIPS, r.i16()/TWIPS
        ]
      });
    }

    var objects = new Map();
    var depthMemory = new Map();
    var current = "_intro";
    var anims = {};
    anims[current] = [];
    var frameCount = r.i16();

    for (var f=0; f<frameCount; f++) {
      var flags = r.u8();

      if (flags & FF_REMOVES) {
        var removes = r.u8();
        for (var rr=0; rr<removes; rr++) {
          var removeId = r.i16();
          if (objects.has(removeId)) depthMemory.set(removeId, objects.get(removeId));
          objects.delete(removeId);
        }
      }

      if (flags & FF_ADDS) {
        var adds = r.u8();
        for (var aa=0; aa<adds; aa++) {
          var objectNumber = r.i16() & 0x07FF;
          var resourceNumber = r.u8();
          var old = depthMemory.get(objectNumber);
          objects.set(objectNumber, {
            res:resourceNumber,
            m:old ? old.m.slice() : [1,0,0,1,0,0],
            color:old ? old.color.slice() : [255,255,255,255]
          });
        }
      }

      if (flags & FF_MOVES) {
        var moves = r.u8();
        for (var mm=0; mm<moves; mm++) {
          var foan = r.u16();
          var objNum = foan & 0x07FF;
          var moveFlags = foan & 0xF800;
          var obj = objects.get(objNum) || { res:0, m:[1,0,0,1,0,0], color:[255,255,255,255] };
          var m00=1, m01=0, m10=0, m11=1;

          if (moveFlags & MF_MATRIX) {
            m00=r.i32()/Q16; m01=r.i32()/Q16; m10=r.i32()/Q16; m11=r.i32()/Q16;
          } else if (moveFlags & MF_ROTATE) {
            var rot=r.i16()/1000;
            m00=Math.cos(rot); m01=-Math.sin(rot); m10=Math.sin(rot); m11=Math.cos(rot);
          }
          var m02, m12;
          if (moveFlags & MF_LONGCOORDS) {
            m02=r.i32()/TWIPS; m12=r.i32()/TWIPS;
          } else {
            m02=r.i16()/TWIPS; m12=r.i16()/TWIPS;
          }
          obj.m=[m00,m01,m10,m11,m02,m12];
          if (moveFlags & MF_COLOR) obj.color=[r.u8(),r.u8(),r.u8(),r.u8()];
          objects.set(objNum,obj);
          depthMemory.set(objNum,{res:obj.res,m:obj.m.slice(),color:obj.color.slice()});
        }
      }

      if (flags & FF_FRAME_NAME) {
        current = r.str();
        if (!anims[current]) anims[current]=[];
      }

      var snapshot = Array.from(objects.keys()).sort(function(a,b){return a-b;}).map(function (key) {
        var o=objects.get(key);
        return [key,o.res,o.m.slice(),o.color.slice()];
      });
      anims[current].push(snapshot);
    }

    Object.keys(anims).forEach(function (name) {
      if (anims[name].length) out.animations[name]={frame_count:anims[name].length,frames:anims[name]};
    });

    function combo(name, parts) {
      var frames=[];
      parts.forEach(function(part){ if(out.animations[part]) frames=frames.concat(out.animations[part].frames); });
      if(frames.length) out.animations[name]={frame_count:frames.length,frames:frames};
    }
    combo("attack_all",["attack_ready","attack"]);
    combo("s_attack_all",["s_attack_ready","s_attack"]);
    combo("s2_attack_all",["s2_attack_ready","s2_attack"]);
    return out;
  }

  function plistValue(node) {
    if (!node) return null;
    var tag = node.tagName;
    if (tag === "dict") {
      var obj = {};
      var children = Array.from(node.children);
      for (var i=0; i<children.length; i+=2) {
        obj[children[i].textContent] = plistValue(children[i+1]);
      }
      return obj;
    }
    if (tag === "array") return Array.from(node.children).map(plistValue);
    if (tag === "true") return true;
    if (tag === "false") return false;
    if (tag === "integer" || tag === "real") return Number(node.textContent);
    return node.textContent;
  }

  function parsePlist(text) {
    var xml = new DOMParser().parseFromString(text,"application/xml");
    var root = xml.querySelector("plist > *");
    var data = plistValue(root);
    var result = {};
    var frames = data && data.frames ? data.frames : {};
    Object.keys(frames).forEach(function (name) {
      var info=frames[name] || {};
      var raw=String(info.textureRect || info.frame || "");
      var nums=(raw.match(/-?\d+/g) || []).map(Number);
      result[name]={
        rect:nums.length>=4 ? nums.slice(0,4) : [0,0,0,0],
        rotated:Boolean(info.textureRotated || info.rotated)
      };
    });
    return result;
  }

  var partCache = new Map();

  async function loadPart(id, partName) {
    var cacheKey=id+":"+partName;
    if (partCache.has(cacheKey)) return partCache.get(cacheKey);
    var promise = (async function () {
      var folder=REPO_BASE + id + "/";
      var partBase=folder + id + "-" + partName;
      var samResponse=await fetch(partBase+".sam");
      if(!samResponse.ok) throw new Error(partName+" SAM unavailable for "+id);
      var samBuffer=await samResponse.arrayBuffer();
      var lastError;

      for (var i=0; i<PART_CANDIDATE_SUFFIXES.length; i++) {
        var suffix=PART_CANDIDATE_SUFFIXES[i];
        var textureBase=partBase + suffix;
        try {
          var plistResponse=await fetch(textureBase+".plist");
          if(!plistResponse.ok) continue;
          var plistText=await plistResponse.text();
          var part=parseSam(samBuffer.slice(0));
          part.sprites=parsePlist(plistText);
          part.png=textureBase+".png";
          part.partName=partName;
          return part;
        } catch (err) { lastError=err; }
      }
      throw lastError || new Error(partName+" atlas unavailable for "+id);
    })();
    partCache.set(cacheKey,promise);
    return promise;
  }

  async function loadBodyPart(id) {
    return loadPart(id,"body");
  }
  var imageCache = new Map();
  function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    var promise=new Promise(function(resolve,reject){
      var img=new Image();
      img.crossOrigin="anonymous";
      img.onload=function(){resolve(img);};
      img.onerror=function(){reject(new Error("Image failed "+url));};
      img.src=url;
    });
    imageCache.set(url,promise);
    return promise;
  }

  function spriteCanvas(part, atlas, name, cache) {
    if (cache.has(name)) return cache.get(name);
    var s=part.sprites[name];
    if (!s) return null;
    var rect=s.rect || [];
    var sx=rect[0], sy=rect[1], w=rect[2], h=rect[3];
    if (!w || !h) return null;
    var c=document.createElement("canvas");
    c.width=w; c.height=h;
    var ctx=c.getContext("2d");
    if (s.rotated) {
      ctx.translate(w/2,h/2);
      ctx.rotate(-Math.PI/2);
      ctx.drawImage(atlas,sx,sy,h,w,-h/2,-w/2,h,w);
    } else {
      ctx.drawImage(atlas,sx,sy,w,h,0,0,w,h);
    }
    cache.set(name,c);
    return c;
  }

  function drawSprite(ctx,sprite,objectMatrix,imageMatrix,color,originX,originY,scaleX,scaleY) {
    var m00=objectMatrix[0],m01=objectMatrix[1],m10=objectMatrix[2],m11=objectMatrix[3],m02=objectMatrix[4],m12=objectMatrix[5];
    var i00=imageMatrix[0],i01=imageMatrix[1],i10=imageMatrix[2],i11=imageMatrix[3],i02=imageMatrix[4],i12=imageMatrix[5];
    var w=sprite.width,h=sprite.height,cx=w*.5,cy=h*.5;
    var imageCenterX=i00*cx+i01*cy+i02;
    var imageCenterY=i10*cx+i11*cy+i12;
    var worldX=m00*imageCenterX+m01*imageCenterY+m02;
    var worldY=m10*imageCenterX+m11*imageCenterY+m12;
    var f00=m00*i00+m01*i10, f01=m00*i01+m01*i11, f10=m10*i00+m11*i10, f11=m10*i01+m11*i11;
    var determinant=f00*f11-f01*f10;
    var localScaleX=Math.hypot(f00,f10), localScaleY=Math.hypot(f01,f11);
    var flipX=determinant<0;
    var angle=flipX?Math.atan2(-f10,-f00):Math.atan2(f10,f00);
    var alpha=Array.isArray(color)?Number(color[3] == null ? 255 : color[3])/255:1;
    ctx.save();
    ctx.globalAlpha=clamp(alpha,0,1);
    ctx.translate(originX+worldX*scaleX,originY+worldY*scaleY);
    ctx.rotate(angle);
    ctx.scale((flipX?-1:1)*localScaleX*scaleX,localScaleY*scaleY);
    ctx.drawImage(sprite,-w/2,-h/2);
    ctx.restore();
  }

  function pickAnimation(part, requested) {
    var lists = {
      idle:["idle","wait","stand","_intro"],
      attack:["attack_all","attack","attack_a","attack_b","s_attack_all","s_attack"],
      skill:["s_attack_all","s_attack","s_action_attack_all","s2_attack_all","skill","attack_all","attack"],
      hit:["knockback","damage","hit","idle","wait"]
    };
    var names=lists[requested] || lists.idle;
    for (var i=0;i<names.length;i++) if(part.animations[names[i]]) return names[i];
    var available=Object.keys(part.animations);
    return available[0] || null;
  }

  function frameVisibleBounds(part, frame) {
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;

    (frame || []).forEach(function(item){
      var objectMatrix=item[2];
      var color=item[3];
      var imageDef=part.images[item[1]];
      if(!imageDef || !objectMatrix || !imageDef.m) return;
      if(Array.isArray(color) && Number(color[3] == null ? 255 : color[3])<=0) return;

      var sprite=part.sprites && part.sprites[imageDef.name];
      var rect=sprite && sprite.rect;
      if(!rect || !rect[2] || !rect[3]) return;

      var w=Number(rect[2]),h=Number(rect[3]);
      var m00=objectMatrix[0],m01=objectMatrix[1],m10=objectMatrix[2],m11=objectMatrix[3],m02=objectMatrix[4],m12=objectMatrix[5];
      var im=imageDef.m;
      var cx=w*.5,cy=h*.5;

      var imageCenterX=im[0]*cx+im[1]*cy+im[4];
      var imageCenterY=im[2]*cx+im[3]*cy+im[5];
      var worldX=m00*imageCenterX+m01*imageCenterY+m02;
      var worldY=m10*imageCenterX+m11*imageCenterY+m12;

      var f00=m00*im[0]+m01*im[2];
      var f01=m00*im[1]+m01*im[3];
      var f10=m10*im[0]+m11*im[2];
      var f11=m10*im[1]+m11*im[3];

      var extentX=Math.abs(f00)*w*.5+Math.abs(f01)*h*.5;
      var extentY=Math.abs(f10)*w*.5+Math.abs(f11)*h*.5;

      minX=Math.min(minX,worldX-extentX);
      maxX=Math.max(maxX,worldX+extentX);
      minY=Math.min(minY,worldY-extentY);
      maxY=Math.max(maxY,worldY+extentY);
    });

    if(!Number.isFinite(minX)) return null;
    return {
      minX:minX,minY:minY,maxX:maxX,maxY:maxY,
      w:Math.max(1,maxX-minX),
      h:Math.max(1,maxY-minY),
      cx:(minX+maxX)*.5,
      cy:(minY+maxY)*.5
    };
  }

  function animationVisibleBounds(part, animationName) {
    part._bodyBoundsCache=part._bodyBoundsCache || {};
    if(part._bodyBoundsCache[animationName]) return part._bodyBoundsCache[animationName];

    var anim=part.animations && part.animations[animationName];
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;

    if(anim){
      anim.frames.forEach(function(frame){
        frame.forEach(function(item){
          var objectMatrix=item[2];
          var color=item[3];
          var imageDef=part.images[item[1]];
          if(!imageDef || !objectMatrix || !imageDef.m) return;
          if(Array.isArray(color) && Number(color[3] == null ? 255 : color[3])<=0) return;

          var sprite=part.sprites && part.sprites[imageDef.name];
          var rect=sprite && sprite.rect;
          if(!rect || !rect[2] || !rect[3]) return;

          var w=Number(rect[2]),h=Number(rect[3]);
          var m00=objectMatrix[0],m01=objectMatrix[1],m10=objectMatrix[2],m11=objectMatrix[3],m02=objectMatrix[4],m12=objectMatrix[5];
          var im=imageDef.m;
          var cx=w*.5,cy=h*.5;

          var imageCenterX=im[0]*cx+im[1]*cy+im[4];
          var imageCenterY=im[2]*cx+im[3]*cy+im[5];
          var worldX=m00*imageCenterX+m01*imageCenterY+m02;
          var worldY=m10*imageCenterX+m11*imageCenterY+m12;

          var f00=m00*im[0]+m01*im[2];
          var f01=m00*im[1]+m01*im[3];
          var f10=m10*im[0]+m11*im[2];
          var f11=m10*im[1]+m11*im[3];

          var extentX=Math.abs(f00)*w*.5+Math.abs(f01)*h*.5;
          var extentY=Math.abs(f10)*w*.5+Math.abs(f11)*h*.5;

          minX=Math.min(minX,worldX-extentX);
          maxX=Math.max(maxX,worldX+extentX);
          minY=Math.min(minY,worldY-extentY);
          maxY=Math.max(maxY,worldY+extentY);
        });
      });
    }

    if(!Number.isFinite(minX)){
      var box=part.canvas || {x:0,y:0,w:200,h:200};
      minX=box.x || 0;
      minY=box.y || 0;
      maxX=minX+(Math.abs(box.w)||200);
      maxY=minY+(Math.abs(box.h)||200);
    }

    var width=Math.max(1,maxX-minX);
    var height=Math.max(1,maxY-minY);
    var result={
      minX:minX,minY:minY,maxX:maxX,maxY:maxY,
      w:width,h:height,
      cx:(minX+maxX)*.5,
      cy:(minY+maxY)*.5
    };
    part._bodyBoundsCache[animationName]=result;
    return result;
  }

  function UnitAnimator(canvas,id,facing) {
    this.canvas=canvas;
    this.id=id;
    this.facing=facing || 1;
    this.part=null;
    this.atlas=null;
    this.spriteCache=new Map();
    this.clip="idle";
    this.clipStarted=performance.now();
    this.oneShot=false;
    this.running=true;
    this.raf=0;
    this.ctx=canvas.getContext("2d");
    this.ready=this.load();
  }

  UnitAnimator.prototype.load=async function(){
    try {
      this.part=await loadBodyPart(this.id);
      this.atlas=await loadImage(this.part.png);
      this.loop();
    } catch(err) {
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      this.ctx.font="700 12px system-ui";
      this.ctx.fillStyle="rgba(35,50,74,.55)";
      this.ctx.textAlign="center";
      this.ctx.fillText(units[this.id].name,this.canvas.width/2,this.canvas.height/2);
      console.warn(err);
    }
  };

  UnitAnimator.prototype.resize=function(){
    var dpr=Math.min(window.devicePixelRatio || 1,2);
    var rect=this.canvas.getBoundingClientRect();
    var w=Math.max(1,Math.floor(rect.width*dpr));
    var h=Math.max(1,Math.floor(rect.height*dpr));
    if(this.canvas.width!==w || this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  };

  UnitAnimator.prototype.play=function(clip,oneShot){
    this.clip=clip || "idle";
    this.oneShot=Boolean(oneShot);
    this.clipStarted=performance.now();
  };

  UnitAnimator.prototype.loop=function(){
    if(!this.running || !this.part || !this.atlas) return;
    this.resize();
    var ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    var animationName=pickAnimation(this.part,this.clip);
    var anim=this.part.animations[animationName];
    if(anim){
      var elapsed=(performance.now()-this.clipStarted)/1000;
      var raw=Math.floor(elapsed*Math.max(1,this.part.anim_rate || 24));
      var frameIndex=this.oneShot?Math.min(raw,anim.frame_count-1):(raw%anim.frame_count);
      var frame=anim.frames[frameIndex] || [];

      // Do not trust the SAM nominal canvas as a clipping/fit boundary.
      // Some Rangers draw well outside it. Fit using the actual visible
      // sprite bounds across the selected animation instead.
      var bounds=animationVisibleBounds(this.part,animationName);
      var horizontalPadding=Math.max(10,w*.055);
      var topPadding=Math.max(8,h*.035);
      var bottomPadding=Math.max(4,h*.015);
      var usableW=Math.max(1,w-horizontalPadding*2);
      var usableH=Math.max(1,h-topPadding-bottomPadding);

      // All Rangers now share the same battlefield world scale instead of
      // individually expanding to fill their card. This preserves their
      // native relative body sizes. A small per-unit art-direction multiplier
      // is only used to keep bosses / very small characters readable.
      var dpr=Math.min(window.devicePixelRatio || 1,2);
      var cssW=w/dpr;
      var cssH=h/dpr;
      var worldScaleCss=Math.min(cssW/245,cssH/270);
      var designScale=(units[this.id] && units[this.id].visualScale) || 1;
      var worldScale=worldScaleCss*dpr*designScale;
      var fitScale=Math.min(
        usableW/Math.max(1,bounds.w),
        usableH/Math.max(1,bounds.h)
      );
      var scale=Math.min(worldScale,fitScale);
      var scaleX=scale*this.facing;

      // Horizontal center is fixed, but vertically every animation is anchored
      // by its actual visible bottom edge. Feet therefore stay on one ground
      // line even when idle/attack animations have different canvas bounds.
      var visualCenterX=w*.5;
      var groundY=h-bottomPadding;
      var originX=visualCenterX-bounds.cx*scaleX;

      // Idle animations are grounded frame-by-frame. This removes the
      // floating / bobbing caused by individual idle frames having slightly
      // different visible bottom bounds. Attack and skill clips intentionally
      // keep the animation-wide anchor so jumps and knockback motion remain.
      var currentFrameBounds=frameVisibleBounds(this.part,frame);
      var lockFeet=this.clip==="idle";
      var anchorMaxY=(lockFeet && currentFrameBounds) ? currentFrameBounds.maxY : bounds.maxY;
      var originY=groundY-anchorMaxY*scale;

      // Keep the target marker just above the actually rendered character,
      // not at the top of the oversized combatant card.
      if(currentFrameBounds && this.canvas.parentElement){
        var renderedTop=originY+currentFrameBounds.minY*scale;
        var cssTop=this.canvas.offsetTop+(renderedTop/dpr);
        this.canvas.parentElement.style.setProperty("--target-top",Math.max(2,cssTop-30)+"px");
      }

      for(var i=0;i<frame.length;i++){
        var item=frame[i];
        var imageDef=this.part.images[item[1]];
        if(!imageDef) continue;
        var sprite=spriteCanvas(this.part,this.atlas,imageDef.name,this.spriteCache);
        if(!sprite) continue;
        drawSprite(ctx,sprite,item[2],imageDef.m,item[3],originX,originY,scaleX,scale);
      }

      if(this.oneShot && raw>=anim.frame_count){
        this.clip="idle";
        this.oneShot=false;
        this.clipStarted=performance.now();
      }
    }
    var self=this;
    this.raf=requestAnimationFrame(function(){self.loop();});
  };

  UnitAnimator.prototype.stop=function(){ this.running=false; if(this.raf) cancelAnimationFrame(this.raf); };

  function stopAllAnimators(){
    animators.forEach(function(anim){anim.stop();});
    animators.clear();
  }

  function combatantElement(unit) {
    if(!battle || !unit) return null;
    var list=unit.side==="ally"?battle.allies:battle.enemies;
    var container=el(unit.side==="ally"?"ally-team":"enemy-team");
    var index=list.indexOf(unit);
    return index<0 ? null : container.querySelector('[data-index="'+index+'"]');
  }

  function projectileAnimationName(part, preferred) {
    var names=preferred || ["normal","move","idle","finish"];
    for(var i=0;i<names.length;i++){
      if(part.animations && part.animations[names[i]]) return names[i];
    }
    var available=Object.keys(part.animations || {});
    return available[0] || null;
  }

  function projectileBounds(part, animationName) {
    part._boundsCache=part._boundsCache || {};
    if(part._boundsCache[animationName]) return part._boundsCache[animationName];
    var anim=part.animations && part.animations[animationName];
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    if(anim){
      anim.frames.forEach(function(frame){
        frame.forEach(function(item){
          var objectMatrix=item[2], imageDef=part.images[item[1]];
          if(!imageDef || !objectMatrix || !imageDef.m) return;
          var sprite=part.sprites && part.sprites[imageDef.name];
          var rect=sprite && sprite.rect;
          if(!rect || !rect[2] || !rect[3]) return;
          var w=rect[2],h=rect[3];
          var m00=objectMatrix[0],m01=objectMatrix[1],m10=objectMatrix[2],m11=objectMatrix[3],m02=objectMatrix[4],m12=objectMatrix[5];
          var im=imageDef.m;
          var cx=w*.5,cy=h*.5;
          var imageCenterX=im[0]*cx+im[1]*cy+im[4];
          var imageCenterY=im[2]*cx+im[3]*cy+im[5];
          var worldX=m00*imageCenterX+m01*imageCenterY+m02;
          var worldY=m10*imageCenterX+m11*imageCenterY+m12;
          var f00=m00*im[0]+m01*im[2];
          var f01=m00*im[1]+m01*im[3];
          var f10=m10*im[0]+m11*im[2];
          var f11=m10*im[1]+m11*im[3];
          var ex=Math.abs(f00)*w*.5+Math.abs(f01)*h*.5;
          var ey=Math.abs(f10)*w*.5+Math.abs(f11)*h*.5;
          minX=Math.min(minX,worldX-ex); maxX=Math.max(maxX,worldX+ex);
          minY=Math.min(minY,worldY-ey); maxY=Math.max(maxY,worldY+ey);
        });
      });
    }
    if(!Number.isFinite(minX)) { minX=-40;maxX=40;minY=-40;maxY=40; }
    var result={minX:minX,maxX:maxX,minY:minY,maxY:maxY,cx:(minX+maxX)/2,cy:(minY+maxY)/2,w:maxX-minX,h:maxY-minY};
    part._boundsCache[animationName]=result;
    return result;
  }

  function drawProjectilePart(ctx,part,atlas,spriteCache,animationName,elapsed,x,y,scale,facing,loop){
    var anim=part.animations && part.animations[animationName];
    if(!anim || !anim.frame_count) return;
    var fps=Math.max(1,part.anim_rate || 24);
    var raw=Math.floor(elapsed*fps);
    var frameIndex=loop ? ((raw%anim.frame_count)+anim.frame_count)%anim.frame_count : Math.min(raw,anim.frame_count-1);
    var frame=anim.frames[frameIndex] || [];
    var bounds=projectileBounds(part,animationName);
    var scaleX=scale*facing;
    var originX=x-bounds.cx*scaleX;
    var originY=y-bounds.cy*scale;

    for(var i=0;i<frame.length;i++){
      var item=frame[i];
      var imageDef=part.images[item[1]];
      if(!imageDef) continue;
      var sprite=spriteCanvas(part,atlas,imageDef.name,spriteCache);
      if(!sprite) continue;
      drawSprite(ctx,sprite,item[2],imageDef.m,item[3],originX,originY,scaleX,scale);
    }
  }

  async function findProjectilePart(id,kind){
    var order=kind==="skill" ? ["bul2","bul3","bul"] : ["bul"];
    for(var i=0;i<order.length;i++){
      try { return await loadPart(id,order[i]); }
      catch(err) {}
    }
    return null;
  }

  function preloadProjectileFor(id) {
    ["bul","bul2","bul3"].forEach(function(partName){
      loadPart(id,partName).catch(function(){});
    });
  }

  async function playProjectile(actor,target,kind) {
    var part=await findProjectilePart(actor.id,kind);
    if(!part) return false;

    var actorCard=combatantElement(actor);
    var targetCard=combatantElement(target);
    var field=document.querySelector(".battlefield");
    if(!actorCard || !targetCard || !field) return false;

    var atlas;
    try { atlas=await loadImage(part.png); }
    catch(err) { return false; }

    var fieldRect=field.getBoundingClientRect();
    var actorRect=actorCard.getBoundingClientRect();
    var targetRect=targetCard.getBoundingClientRect();
    var start={
      x:actorRect.left-fieldRect.left+actorRect.width*(actor.side==="ally"?.68:.32),
      y:actorRect.top-fieldRect.top+actorRect.height*.48
    };
    var end={
      x:targetRect.left-fieldRect.left+targetRect.width*.5,
      y:targetRect.top-fieldRect.top+targetRect.height*.48
    };

    var canvas=document.createElement("canvas");
    canvas.className="projectile-fx-canvas";
    var dpr=Math.min(window.devicePixelRatio || 1,2);
    canvas.width=Math.max(1,Math.round(fieldRect.width*dpr));
    canvas.height=Math.max(1,Math.round(fieldRect.height*dpr));
    field.appendChild(canvas);
    var ctx=canvas.getContext("2d");
    var spriteCache=new Map();
    var normalName=projectileAnimationName(part,["normal","move","idle"]);
    var finishName=part.animations && part.animations.finish ? "finish" : null;
    if(!normalName){canvas.remove();return false;}

    var bounds=projectileBounds(part,normalName);
    var nativeSize=Math.max(1,bounds.w,bounds.h);
    var desiredCss=kind==="skill"?115:82;
    var scale=clamp((desiredCss*dpr)/nativeSize,.18,2.6);
    var facing=actor.side==="ally"?1:-1;
    var flightMs=kind==="skill"?560:470;
    var started=performance.now();

    await new Promise(function(resolve){
      function frame(now){
        var progress=clamp((now-started)/flightMs,0,1);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        var px=(start.x+(end.x-start.x)*progress)*dpr;
        var arc=kind==="skill"?Math.sin(Math.PI*progress)*55:Math.sin(Math.PI*progress)*18;
        var py=(start.y+(end.y-start.y)*progress-arc)*dpr;
        drawProjectilePart(ctx,part,atlas,spriteCache,normalName,(now-started)/1000,px,py,scale,facing,true);
        if(progress<1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });

    if(finishName){
      var finishStarted=performance.now();
      var finishAnim=part.animations[finishName];
      var finishDuration=Math.min(.45,Math.max(.12,finishAnim.frame_count/Math.max(1,part.anim_rate||24)));
      await new Promise(function(resolve){
        function finishFrame(now){
          var elapsed=(now-finishStarted)/1000;
          ctx.clearRect(0,0,canvas.width,canvas.height);
          drawProjectilePart(ctx,part,atlas,spriteCache,finishName,elapsed,end.x*dpr,end.y*dpr,scale,facing,false);
          if(elapsed<finishDuration) requestAnimationFrame(finishFrame); else resolve();
        }
        requestAnimationFrame(finishFrame);
      });
    }

    canvas.remove();
    return true;
  }

  function cloneCombatant(id,side,index){
    var base=units[id];
    return {
      key:side+"-"+index+"-"+id,
      id:id,name:base.name,role:base.role,maxHp:base.hp,hp:base.hp,atk:base.atk,
      skill:base.skill,skillDesc:base.skillDesc,side:side,dead:false,acted:false,shield:0,
      attackBuff:1,stunned:false
    };
  }

  function startBattle(stageNumber) {
    stopAllAnimators();
    var stage=stages[stageNumber-1];
    battle={
      stage:stage,
      allies:selectedParty.map(function(id,i){return cloneCombatant(id,"ally",i);}),
      enemies:stage.enemies.map(function(id,i){return cloneCombatant(id,"enemy",i);}),
      turn:"ally",
      activeIndex:0,
      targetIndex:0,
      locked:false,
      round:1
    };
    el("battle-stage-label").textContent="STAGE "+stage.n;
    el("battle-stage-name").textContent=stage.name;
    el("result-modal").classList.add("hidden");
    showScreen("battle-screen");
    renderBattle();
    setActiveAlly(0);
    announce("第 "+battle.round+" 回合 · Rangers 行動！");
  }

  function renderBattle(){
    renderCombatTeam("ally-team",battle.allies,1);
    renderCombatTeam("enemy-team",battle.enemies,-1);
    battle.allies.concat(battle.enemies).forEach(function(unit){preloadProjectileFor(unit.id);});
    updateTurnUI();
    updateCommandUI();
  }

  function renderCombatTeam(containerId,list,facing){
    var container=el(containerId);
    container.innerHTML=list.map(function(u,index){
      var ratio=Math.max(0,u.hp/u.maxHp);
      return '<div class="combatant '+(u.dead?"dead":"")+'" data-side="'+u.side+'" data-index="'+index+'">' +
        '<canvas class="unit-canvas" aria-label="'+u.name+'"></canvas>' +
        '<div class="hp-shell"><div class="hp-fill '+(ratio<.3?"low":"")+'" style="width:'+(ratio*100)+'%"></div></div>' +
        '<div class="nameplate">'+u.name+' · '+Math.max(0,Math.round(u.hp))+'/'+u.maxHp+'</div>' +
      '</div>';
    }).join("");

    Array.from(container.querySelectorAll(".combatant")).forEach(function(card,index){
      var canvas=card.querySelector("canvas");
      var unit=list[index];
      var animator=new UnitAnimator(canvas,unit.id,facing);
      animators.set(unit.key,animator);
      if(unit.side==="enemy" && !unit.dead){
        card.classList.add("targetable");
        card.addEventListener("click",function(){
          if(!battle || battle.locked || battle.turn!=="ally") return;
          battle.targetIndex=index;
          updateTargetUI();
        });
      }
    });
    updateTargetUI();
  }

  function updateBarsOnly(){
    ["ally","enemy"].forEach(function(side){
      var list=side==="ally"?battle.allies:battle.enemies;
      var container=el(side==="ally"?"ally-team":"enemy-team");
      Array.from(container.querySelectorAll(".combatant")).forEach(function(card,index){
        var u=list[index],ratio=Math.max(0,u.hp/u.maxHp);
        card.classList.toggle("dead",u.dead);
        var fill=card.querySelector(".hp-fill");
        fill.style.width=(ratio*100)+"%";
        fill.classList.toggle("low",ratio<.3);
        card.querySelector(".nameplate").textContent=u.name+" · "+Math.max(0,Math.round(u.hp))+"/"+u.maxHp;
      });
    });
  }

  function updateTargetUI(){
    document.querySelectorAll("#enemy-team .combatant").forEach(function(card,index){
      card.classList.toggle("targeted",Boolean(battle && battle.turn==="ally" && !battle.enemies[index].dead && index===battle.targetIndex));
    });
  }

  function nextLiving(list,start){
    for(var offset=0;offset<list.length;offset++){
      var idx=(start+offset)%list.length;
      if(!list[idx].dead && !list[idx].acted) return idx;
    }
    return -1;
  }

  function setActiveAlly(index){
    if(!battle) return;
    var next=nextLiving(battle.allies,index);
    if(next<0){ enemyTurn(); return; }
    battle.activeIndex=next;
    var u=battle.allies[next];
    el("active-unit-name").textContent=u.name;
    el("active-unit-role").textContent=u.role;
    el("active-unit-portrait").innerHTML='<img src="'+thumbUrl(u.id)+'" alt="">';
    el("skill-name").textContent=u.skill || "特殊技能";
    el("skill-desc").textContent=u.skillDesc || "";
    updateCommandUI();
  }

  function updateCommandUI(){
    var disabled=!battle || battle.locked || battle.turn!=="ally";
    el("attack-button").disabled=disabled;
    el("skill-button").disabled=disabled;
  }

  function updateTurnUI(){
    var enemy=Boolean(battle && battle.turn==="enemy");
    el("turn-label").textContent=enemy?"敵方回合":"我方回合";
    el("turn-label").classList.toggle("enemy",enemy);
    el("battle-help-title").textContent=enemy?"敵軍正在行動":"選擇敵人";
    el("battle-help-text").textContent=enemy?"準備承受攻擊":"點擊敵方角色指定攻擊目標";
  }

  function livingIndices(list){
    var arr=[];
    list.forEach(function(u,i){if(!u.dead)arr.push(i);});
    return arr;
  }

  function ensureTarget(){
    if(!battle || !battle.enemies.length) return -1;
    if(battle.enemies[battle.targetIndex] && !battle.enemies[battle.targetIndex].dead) return battle.targetIndex;
    var alive=livingIndices(battle.enemies);
    battle.targetIndex=alive.length?alive[0]:-1;
    return battle.targetIndex;
  }

  function showNumber(unit,amount,heal){
    var container=el(unit.side==="ally"?"ally-team":"enemy-team");
    var index=(unit.side==="ally"?battle.allies:battle.enemies).indexOf(unit);
    var card=container.querySelector('[data-index="'+index+'"]');
    if(!card)return;
    var span=document.createElement("span");
    span.className="damage-number"+(heal?" heal":"");
    span.textContent=(heal?"+":"-")+Math.abs(Math.round(amount));
    card.appendChild(span);
    setTimeout(function(){span.remove();},900);
  }

  function animateUnit(unit,clip){
    var animator=animators.get(unit.key);
    if(animator) animator.play(clip,true);
    var list=unit.side==="ally"?battle.allies:battle.enemies;
    var container=el(unit.side==="ally"?"ally-team":"enemy-team");
    var index=list.indexOf(unit);
    var card=container.querySelector('[data-index="'+index+'"]');
    if(card){
      card.classList.add("acting");
      setTimeout(function(){card.classList.remove("acting");},500);
    }
  }

  function applyDamage(target,amount){
    var actual=Math.max(1,Math.round(amount));
    if(target.shield>0){
      var blocked=Math.min(target.shield,actual);
      target.shield-=blocked;
      actual-=blocked;
      if(blocked>0) announce(target.name+" 的護盾吸收 "+blocked+" 傷害");
    }
    if(actual>0){
      target.hp-=actual;
      showNumber(target,actual,false);
      var animator=animators.get(target.key);
      if(animator) setTimeout(function(){animator.play("hit",true);},240);
    }
    if(target.hp<=0){target.hp=0;target.dead=true;}
    updateBarsOnly();
  }

  function healUnit(target,amount){
    if(target.dead) return;
    var before=target.hp;
    target.hp=Math.min(target.maxHp,target.hp+amount);
    var healed=target.hp-before;
    if(healed>0) showNumber(target,healed,true);
    updateBarsOnly();
  }

  function announce(text){
    var banner=el("message-banner");
    banner.textContent=text;
    banner.classList.add("show");
    clearTimeout(announce.timer);
    announce.timer=setTimeout(function(){banner.classList.remove("show");},1450);
  }

  async function playerAction(kind){
    if(!battle || battle.locked || battle.turn!=="ally") return;
    var actor=battle.allies[battle.activeIndex];
    if(!actor || actor.dead || actor.acted) return;
    var targetIndex=ensureTarget();
    if(targetIndex<0) return finishBattle(true);
    var target=battle.enemies[targetIndex];
    battle.locked=true;
    updateCommandUI();

    if(kind==="skill"){
      await performSkill(actor,target);
    } else {
      animateUnit(actor,"attack");
      announce(actor.name+" 發動普通攻擊！");
      await sleep(110);
      var usedProjectile=await playProjectile(actor,target,"attack");
      if(!usedProjectile) await sleep(150);
      applyDamage(target,actor.atk*actor.attackBuff*(.92+Math.random()*.17));
      actor.attackBuff=1;
      await sleep(300);
    }

    actor.acted=true;
    if(checkBattleEnd()) return;
    battle.locked=false;
    ensureTarget();
    updateTargetUI();
    var next=nextLiving(battle.allies,battle.activeIndex+1);
    if(next<0) enemyTurn();
    else setActiveAlly(next);
  }

  async function performSkill(actor,target){
    animateUnit(actor,"skill");
    announce(actor.name+" · "+actor.skill+"！");
    await sleep(120);

    if(actor.id==="u1138e-james"){
      await playProjectile(actor,target,"skill");
      applyDamage(target,actor.atk*1.5*actor.attackBuff);
      actor.attackBuff=1;
      battle.allies.forEach(function(u){if(!u.dead)u.shield+=120;});
    } else if(actor.id==="u1137e-cony"){
      await playProjectile(actor,target,"skill");
      applyDamage(target,actor.atk*1.9*actor.attackBuff);
      actor.attackBuff=1;
    } else if(actor.id==="u1136e-moon"){
      var livingEnemies=battle.enemies.filter(function(u){return !u.dead;});
      var shots=await Promise.all(livingEnemies.map(function(enemy){return playProjectile(actor,enemy,"skill");}));
      if(!shots.some(Boolean)) await sleep(180);
      livingEnemies.forEach(function(u){applyDamage(u,actor.atk*.95*actor.attackBuff);});
      actor.attackBuff=1;
    } else if(actor.id==="u1134e-brown"){
      await sleep(170);
      applyDamage(target,actor.atk*1.4*actor.attackBuff);
      actor.attackBuff=1;
      if(!target.dead && Math.random()<.5){target.stunned=true;announce(target.name+" 暈眩了！");}
    } else if(actor.id==="u2032e-jessica"){
      await sleep(220);
      battle.allies.forEach(function(u){healUnit(u,u.maxHp*.28);});
    } else if(actor.id==="u2034e-sally"){
      await sleep(220);
      battle.allies.forEach(function(u){if(!u.dead)u.attackBuff=Math.max(u.attackBuff,1.35);});
      announce("全隊攻擊力提升！");
    } else {
      var skillProjectile=await playProjectile(actor,target,"skill");
      if(!skillProjectile) await sleep(160);
      applyDamage(target,actor.atk*1.5);
    }
    await sleep(340);
  }

  el("attack-button").addEventListener("click",function(){playerAction("attack");});
  el("skill-button").addEventListener("click",function(){playerAction("skill");});

  async function enemyTurn(){
    if(!battle || checkBattleEnd()) return;
    battle.turn="enemy";
    battle.locked=true;
    updateTurnUI();
    updateCommandUI();
    announce("敵軍開始反擊！");
    await sleep(600);

    for(var i=0;i<battle.enemies.length;i++){
      var enemy=battle.enemies[i];
      if(enemy.dead) continue;
      if(enemy.stunned){enemy.stunned=false;announce(enemy.name+" 因暈眩無法行動");await sleep(520);continue;}
      var alive=livingIndices(battle.allies);
      if(!alive.length) break;
      var target=battle.allies[alive[Math.floor(Math.random()*alive.length)]];
      animateUnit(enemy,"attack");
      announce(enemy.name+" 攻擊 "+target.name+"！");
      await sleep(110);
      var usedEnemyProjectile=await playProjectile(enemy,target,"attack");
      if(!usedEnemyProjectile) await sleep(170);
      applyDamage(target,enemy.atk*(.86+Math.random()*.24));
      await sleep(330);
      if(checkBattleEnd()) return;
    }

    battle.allies.forEach(function(u){u.acted=false;});
    battle.turn="ally";
    battle.locked=false;
    battle.round+=1;
    updateTurnUI();
    announce("第 "+battle.round+" 回合 · Rangers 行動！");
    setActiveAlly(0);
  }

  function checkBattleEnd(){
    if(!battle)return false;
    var win=battle.enemies.every(function(u){return u.dead;});
    var lose=battle.allies.every(function(u){return u.dead;});
    if(win||lose){finishBattle(win);return true;}
    return false;
  }

  function finishBattle(win){
    if(!battle)return;
    battle.locked=true;
    updateCommandUI();
    setTimeout(function(){
      el("result-kicker").textContent=win?"VICTORY":"DEFEAT";
      el("result-title").textContent=win?"戰鬥勝利！":"挑戰失敗";
      el("result-text").textContent=win?"Rangers 成功突破「"+battle.stage.name+"」。":"重新調整隊伍，再次挑戰這個關卡。";
      el("result-modal").classList.remove("hidden");
    },600);
  }

  window.addEventListener("resize",function(){
    animators.forEach(function(anim){anim.resize();});
  });

  renderHeroStrip();
})();