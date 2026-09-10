"""Author the visible boat and hardware in Blender, export evaluated meshes.
Blender --background --factory-startup --python build-tools/model-boat.py
Coordinates in this script are boat x=forward, y=up, z=port; converted for Blender.
"""
import bpy, math, json, re
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
R=json.loads(re.search(r'const RIG=(\{[^;]+\});', (ROOT/'src-app.html').read_text()).group(1))
OUT=ROOT/'assets'/'boat'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M={}
for name,color,metal,rough in [
 ('gelcoat',(.81,.85,.83),0,.24),('nonskid',(.53,.59,.56),0,.83),
 ('steel',(.64,.71,.74),.92,.21),('anodized',(.19,.24,.27),.82,.29),
 ('rubber',(.018,.027,.030),0,.65),('sheave',(.17,.19,.16),.12,.40),
 ('glass',(.028,.09,.11),.4,.16),('stripe',(.013,.11,.15),.15,.3),
 ('canvas',(.19,.23,.21),0,.94),('interior',(.70,.72,.69),0,.75),('wood',(.38,.18,.055),0,.28)]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 m.use_fake_user=True;M[name]=m

def cv(p):return (p[0],p[2],p[1])
def finish(o,name,mat,asset='boat',bevel=0):
 o.name=name;o.data.materials.append(M[mat]);o['asset']=asset
 if bevel:
  mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 for poly in o.data.polygons:poly.use_smooth=True
 return o

def box(name,pos,size,mat,bevel=.015,asset='boat'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=cv(pos));o=bpy.context.object;o.dimensions=cv(size)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,asset,bevel)
def cylinder(name,pos,r,depth,mat,asset='boat',axis='y',r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=cv(pos))
 o=bpy.context.object
 if axis=='z':o.rotation_euler.x=math.pi/2
 if axis=='x':o.rotation_euler.y=math.pi/2
 return finish(o,name,mat,asset,.003)
def torus(name,pos,major,minor,mat,asset='boat',axis='y'):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=cv(pos),major_radius=major,minor_radius=minor)
 o=bpy.context.object
 if axis=='z':o.rotation_euler.x=math.pi/2
 if axis=='x':o.rotation_euler.y=math.pi/2
 return finish(o,name,mat,asset)
def mesh(name,verts,faces,mat,asset='boat',sub=0):
 data=bpy.data.meshes.new(name);data.from_pydata([cv(v) for v in verts],[],faces);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);finish(o,name,mat,asset)
 if sub:
  mod=o.modifiers.new('Fair hull surfaces','SUBSURF');mod.levels=sub;mod.render_levels=sub
 return o

def tube(name,points,r,mat,asset='boat'):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=4;curve.bevel_depth=r;curve.bevel_resolution=2
 sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for b,p in zip(sp.bezier_points,points):b.co=cv(p);b.handle_left_type=b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(M[mat]);o['asset']=asset
 return o

# Longitudinal stations traced proportionally from user side/aerial references.
# LOA 7.8232 m and beam 2.5908 m are published; intermediate stations are estimates.
ST=[(0,0,.80,-.03),(.08,.36,.79,-.20),(.20,.74,.78,-.38),(.35,1.09,.77,-.47),(.50,1.2954,.77,-.46),(.65,1.27,.77,-.37),(.80,1.16,.74,-.23),(.90,1.02,.64,-.09),(1,.83,.28,.02)]
def station(t):
 for a,b in zip(ST,ST[1:]):
  if t<=b[0]:
   q=(t-a[0])/(b[0]-a[0]);return tuple(a[k]+q*(b[k]-a[k]) for k in range(1,4))
 return ST[-1][1:]
def shape(t,u):
 half,deck,belly=station(t);v=abs(u)
 # Plumb upper stem, raked forefoot, low reverse transom.
 x=3.9116-t*7.8232-.40*(1-v)*max(0,1-t/.15)+.52*(1-v)*max(0,(t-.86)/.14)
 return (x,belly+(deck-belly)*v**1.9,half*(1 if u>=0 else -1)*v**.72)
verts=[shape(i/64,j/20*2-1) for i in range(65) for j in range(21)]
faces=[(i*21+j,i*21+j+1,(i+1)*21+j+1,(i+1)*21+j) for i in range(64) for j in range(20)]
hull=mesh('Colgate proportioned hull',verts,faces,'gelcoat',sub=1)
mod=hull.modifiers.new('Hull laminate','SOLIDIFY');mod.thickness=.022
mesh('Low reverse transom',[shape(1,j/20*2-1) for j in range(21)],[tuple(range(21))],'gelcoat')
# Continuous foredeck and side decks, with a deep cockpit rather than raised pads.
rows=[[shape(i/64,-1),shape(i/64,1)] for i in range(30)]
mesh('Foredeck',[p for r in rows for p in r],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(rows)-1)],'gelcoat')
for side in [-1,1]:
 rows=[]
 for i in range(28,65):
  t=i/64;x,y,z=shape(t,side);inside=min(abs(z)-.12,.96)
  rows.append([(x,y,z),(x,y+.045,side*inside),(x,.50 if t<.91 else .28,side*inside)])
 mesh('Continuous cockpit coaming '+str(side),[p for row in rows for p in row],[(3*i+j,3*i+j+1,3*(i+1)+j+1,3*(i+1)+j) for i in range(len(rows)-1) for j in range(2)],'gelcoat')
 # Moulded benches have straight inner edges and taper along the outer hull.
 mesh('Closed cockpit shoulder end '+str(side),[(.015,.21,side*.53),(.015,.50,side*.53),(.015,.80,side*.96),(.015,.21,side*.96)],[(0,1,2,3)],'gelcoat')
 mesh('Companionway side shoulder '+str(side),[(.02,.50,side*.53),(.02,.80,side*.96),(.40,.80,side*.96),(.40,1.10,side*.71),(.25,1.11,side*.71)],[(0,1,2,3,4)],'gelcoat')
 box('Long recessed cockpit bench '+str(side),(-1.39,.38,side*.75),(2.94,.22,.48),'gelcoat',.035)
 for x,length in [(-.46,1.04),(-1.75,1.46),(-2.69,.34)]:
  box('Bench locker nonskid '+str(side),(x,.496,side*.75),(length,.008,.405),'nonskid',.024)
  if length>1:
   for xx in [x-length*.32,x+length*.32]:box('Flush locker hinge',(xx,.503,side*.945),(.05,.006,.035),'steel',.004)
 box('Bench riser '+str(side),(-1.39,.30,side*.505),(2.94,.35,.04),'gelcoat',.024)
 tube('Rubber hull deck seam '+str(side),[shape(i/64,side) for i in range(1,65)],.019,'rubber')
 tube('Fine waterline stripe '+str(side),[(x,y-.027,z) for x,y,z in [shape(i/64,side*.56) for i in range(4,61)]],.008,'stripe')
box('Deep cockpit sole',(-1.50,.18,0),(3.38,.06,1.01),'gelcoat',.04)
box('Sole nonskid',(-1.50,.215,0),(3.20,.008,.90),'nonskid',.025)
box('Aft traveler bridge',(R['travelerX'],.46,0),(.24,.10,1.93),'gelcoat',.025)
box('Low boarding platform',(-3.53,.24,0),(.68,.08,1.68),'gelcoat',.025)
# Low wedge coachroof: mast forward, sloping full-height companionway aft.
vs=[]
for x,width,top in [(.25,.78,1.11),(2.65,.32,.89)]:
 vs += [(x,.75,-width),(x,.75,width),(x,top,width-.07),(x,top+.025,0),(x,top,-width+.07)]
cabin=mesh('Low wedge coachroof',vs,[(0,1,2,3,4),(9,8,7,6,5)]+[(j,(j+1)%5,(j+1)%5+5,j+5) for j in range(5)],'gelcoat')
mod=cabin.modifiers.new('Small moulded roof radii','BEVEL');mod.width=.028;mod.segments=3
mod=cabin.modifiers.new('Coachroof normals','WEIGHTED_NORMAL')
# Bulkhead reaches cockpit sole, angled forward at its top.
bulk=mesh('Sloping cockpit bulkhead',[(.02,.21,-.53),(.02,.21,.53),(.27,1.12,.71),(.27,1.12,-.71)],[(0,1,2,3)],'gelcoat')
mod=bulk.modifiers.new('Bulkhead thickness','SOLIDIFY');mod.thickness=.035
wash=mesh('Companionway washboard',[(.007,.29,-.29),(.007,.29,.29),(.232,1.08,.37),(.232,1.08,-.37)],[(0,1,2,3)],'interior')
for z in [-1,1]:tube('Companionway edge',[(.00,.27,z*.31),(.238,1.10,z*.39)],.012,'gelcoat')
box('Sliding hatch',(.61,1.134,0),(.74,.026,.75),'gelcoat',.012)
cylinder('Vent rim',(.73,1.158,0),.095,.018,'steel')
cylinder('Vent cap',(.73,1.175,0),.074,.022,'steel',r2=.042)
box('Hatch latch',(.242,1.08,0),(.028,.07,.028),'steel',.007)
# Matte inset follows the narrowing foredeck instead of a rectangular cabin pad.
mesh('Foredeck nonskid',[(1.85,.779,-.56),(1.85,.779,.56),(3.42,.804,.15),(3.42,.804,-.15)],[(0,1,2,3)],'nonskid')
# Foil dimensions keep the standard draft at 1.3716 m below water.
for name,x,z0,chord,span in [('Keel',-.20,-.38,1.16,.9916),('Rudder',R['rudderX'],.10,.45,1.15)]:
 vv=[]
 for y,c in [(z0,chord),(z0-span,chord*.77)]:
  for j in range(32):
   a=2*math.pi*j/32;vv.append((x+c*.5*math.cos(a),y,.060*math.sin(a)))
 mesh(name,[(vx-x,vy-z0,vz) for vx,vy,vz in vv] if name=='Rudder' else vv,[(j,(j+1)%32,(j+1)%32+32,j+32) for j in range(32)]+[tuple(range(31,-1,-1)),tuple(range(32,64))],'gelcoat',asset='rudder' if name=='Rudder' else 'boat',sub=1)
# Bronze rudder head and varnished laminated tiller, articulated with rudder.
cylinder('Rudder post',(0,.28,0),.031,.55,'steel','tiller')
box('Tiller head',(0,.57,0),(.20,.085,.105),'anodized',.015,'tiller')
tube('Laminated wooden tiller',[(0,.58,0),(.25,.58,0),(1.30,.64,0),(1.65,.72,0)],.028,'wood','tiller')
for z in [-.022,0,.022]:tube('Tiller laminate',[(.03,.588,z),(.25,.59,z),(1.30,.65,z),(1.65,.73,z)],.004,'gelcoat','tiller')
tube('Tiller extension',[(1.40,.67,0),(1.04,.73,.55)],.012,'rubber','tiller')
# Long straight stainless cockpit rails; no rail across the low transom.
for side in [-1,1]:
 tube('Rigid cockpit safety rail '+str(side),[(-3.0,.66,side*1.00),(-2.90,1.22,side*1.08),(-1.5,1.24,side*1.23),(.30,1.22,side*1.15)],.015,'steel')
 for x,z in [(-2.90,1.08),(-1.50,1.23),(.30,1.15),(2.2,.77)]:
  cylinder('Stanchion base',(x,.78,side*z),.032,.016,'steel')
  tube('Stanchion',[(x,.78,side*z),(x,1.22,side*z)],.011,'steel')
 tube('Squared bow pulpit '+str(side),[(3.08,.79,side*.39),(3.08,1.22,side*.39),(3.64,1.22,side*.16),(3.72,1.22,0)],.014,'steel')
 for x,z in [(3.33,.25),(-3.38,.77)]:
  box('Mooring cleat base',(x,.78 if x>0 else .38,side*z),(.14,.018,.045),'steel',.009)
  tube('Mooring cleat horns',[(x-.095,.815 if x>0 else .415,side*z),(x+.095,.815 if x>0 else .415,side*z)],.012,'steel')
# Aft traveler, behind helmsman's tiller head as shown in the cockpit photo.
box('Aft traveler rail',(R['travelerX'],R['travelerY']-.035,0),(.065,.035,1.85),'anodized',.005)
for side in [-1,1]:
 box('Traveler end stop',(R['travelerX'],R['travelerY'],side*.90),(.09,.05,.08),'rubber',.01)
 x=(R['jibTrackForward']*2-R['jibTrackTravel'])/2;z=side*R['jibTrackZ']
 box('Jib track',(x,R['carY']-.027,z),(R['jibTrackTravel']+.14,.03,.06),'anodized',.006)
 for i in range(10):cylinder('Track screw',(R['jibTrackForward']-i*R['jibTrackTravel']/9,R['carY']-.008,z),.007,.003,'steel')
 x,z,y=R['winchX'],side*R['winchZ'],R['winchY']
 cylinder('Cabin top winch plinth',(x,y-.04,z),.115,.08,'gelcoat')
 cylinder('Winch base',(x,y,z),.105,.025,'anodized')
 cylinder('Winch drum',(x,y+.08,z),.084,.13,'anodized',r2=.078)
 for i in range(6):torus('Drum grip ring',(x,y+.03+i*.018,z),.085,.003,'rubber')
 cylinder('Self tailer',(x,y+.16,z),.099,.035,'steel')
 cylinder('Winch socket',(x,y+.182,z),.019,.007,'rubber')
 for lane in range(3):
  z=side*(.43+lane*.07)
  cylinder('Organizer sheave',(1.25,1.13,z),.033,.025,'sheave')
  box('Rope clutch body',(.84,1.13,z),(.20,.06,.05),'rubber',.01)
  box('Clutch lever',(.84,1.17,z),(.16,.02,.038),'anodized',.006)
 tube('Halyard hanging hook',[(.26,1.08,side*.50),(.15,1.05,side*.50),(.15,1.09,side*.50)],.009,'steel')
 # Hull-side compass, as seen beside the companionway.
 cylinder('Bulkhead compass rim',(.20,.87,side*.59),.064,.035,'rubber',axis='x')
 cylinder('Compass glass',(.176,.87,side*.59),.047,.01,'glass',axis='x')
box('Cockpit mainsheet pedestal',(R['pedestalX'],.37,0),(.19,.31,.21),'gelcoat',.034)
# Furler drum and mast support details.
cylinder('Jib furler drum',(3.72,.91,0),.072,.10,'rubber')
box('Mast tabernacle',(R['mastX'],1.04,0),(.21,.10,.17),'steel',.012)
# Dynamic assets live in their own export groups at the origin.
box('Traveler car',(0,0,0),(.14,.075,.18),'anodized',.018,'car')
for z in [-.07,.07]:cylinder('Car bearing',(0,-.025,z),.029,.025,'sheave','car',axis='x')
# Double block: two grooved wheels on a common axle, sculpted cheek plates.
for z in [-.055,0,.055]:
 cheek=box('Sculpted block cheek',(0,0,z),(.082,.16,.012),'rubber',.035,'block')
 cylinder('Cheek axle cap',(0,-.005,z*1.12),.016,.013,'steel','block',axis='z')
for z in [-.0275,.0275]:
 cylinder('Grooved pulley sheave',(0,-.005,z),.057,.033,'sheave','block',axis='z')
 torus('Sheave outer flange',(0,-.005,z-.014),.049,.008,'sheave','block',axis='z')
 torus('Sheave outer flange',(0,-.005,z+.014),.049,.008,'sheave','block',axis='z')
# Single articulating jib fairlead: rope center follows its 38 mm groove radius.
# Separate from the double mainsheet blocks; no duplicate unused jib sheave.
cylinder('Jib fairlead sheave',(0,0,0),.032,.023,'sheave','fairlead',axis='z')
for z in [-.016,.016]:
 torus('Jib sheave flange',(0,0,z),.033,.004,'sheave','fairlead',axis='z')
 cylinder('Jib fairlead cheek',(0,0,z*1.6),.046,.008,'rubber','fairlead',axis='z')
 cylinder('Fairlead axle',(0,0,z*1.9),.010,.010,'steel','fairlead',axis='z')
# A stainless eye / shackle makes the connection visible.
torus('Block shackle',(0,.11,0),.032,.007,'steel','block',axis='z')
box('Mast extrusion',(0,0,0),(.14,10.6,.095),'steel',.044,'mast')
box('Mast sail track',(-.077,0,0),(.016,10.5,.028),'rubber',.006,'mast')
box('Boom extrusion',(0,0,0),(.12,R['boomLength'],.095),'steel',.035,'boom')
box('Boom upper track',(.064,0,0),(.012,R['boomLength']-.1,.035),'rubber',.004,'boom')
cylinder('Solid vang lower tube',(0,-.20,0),.037,.8,'anodized','vang')
cylinder('Vang telescopic rod',(0,.35,0),.024,.5,'steel','vang')
# UVs: metre-scaled box projection on every evaluated face, then indexed export.
# Original modifier stacks and named parts are kept in the .blend for inspection.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  o.select_set(True);bpy.context.view_layer.objects.active=o
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False) if hasattr(bpy.ops.mesh,'normals_make_consistent') else None
  bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
# Materials stay lit in the editable authoring scene.
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.35,.45,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6
for pos,power,size in [((1,9,-5),1700,7),((-4,5,4),900,5)]:
 bpy.ops.object.light_add(type='AREA',location=cv(pos));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector(cv((0,.5,0)))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=cv((-8,7,-10)));camera=bpy.context.object;camera.rotation_euler=(Vector(cv((0,.5,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=45;bpy.context.scene.camera=camera
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=1400;bpy.context.scene.render.resolution_y=1000;bpy.context.scene.render.resolution_percentage=100
bpy.context.preferences.filepaths.save_version=0
assets={};counts={};deps=bpy.context.evaluated_depsgraph_get()
for obj in bpy.context.scene.objects:
 if 'asset' not in obj:continue
 evaluated=obj.evaluated_get(deps);me=evaluated.to_mesh();me.calc_loop_triangles()
 mat=obj.data.materials[0].name;key=(obj['asset'],mat)
 a=assets.setdefault(key,{'positions':[],'normals':[],'uvs':[],'indices':[],'parts':[]});a['parts'].append(obj.name)
 lookup={};offset=len(a['positions'])//3;matrix=obj.matrix_world;normal_matrix=matrix.to_3x3().inverted().transposed()
 for tri in me.loop_triangles:
  for loop_id in tri.loops:
   loop=me.loops[loop_id];p=matrix@me.vertices[loop.vertex_index].co;n=normal_matrix@me.corner_normals[loop_id].vector;n.normalize()
   # UVs in metres: choose plane perpendicular to the dominant face normal.
   axis=max(range(3),key=lambda k:abs(tri.normal[k]));axes=[k for k in range(3) if k!=axis]
   uv=[p[axes[0]],p[axes[1]]]
   values=tuple(round(v,5) for v in [p.x,p.z,p.y,n.x,n.z,n.y,*uv])
   if values not in lookup:
    lookup[values]=offset+len(lookup);a['positions']+=values[:3];a['normals']+=values[3:6];a['uvs']+=values[6:]
   a['indices'].append(lookup[values])
 evaluated.to_mesh_clear()
result={'generator':'Blender '+bpy.app.version_string,'layout':R,'assets':{}}
for (asset,mat),data in assets.items():result['assets'].setdefault(asset,[]).append({'material':mat,**data})
(OUT/'meshes.json').write_text(json.dumps(result,separators=(',',':')))
print('EXPORTED',sum(len(a['indices'])//3 for a in assets.values()),'triangles',[(k,len(v)) for k,v in result['assets'].items()])

# Keep prototype local coordinates for export, but present an assembled model
# when the .blend opens. Linked copies preserve editable modifier stacks.
placements={
 'mast':[((R['mastX'],6,0),0,1)], 'boom':[((R['mastX']-R['boomLength']/2,R['boomY'],0),-math.pi/2,1)],
 'rudder':[((R['rudderX'],.10,0),0,1)],'tiller':[((R['rudderX'],.10,0),0,1)],'vang':[((R['mastX']-.615,1.435,0),-.98,1)],'fairlead':[((.8,R['carY']+.06,R['jibTrackZ']),0,1),((.8,R['carY']+.06,-R['jibTrackZ']),0,1)],
 'car':[((R['travelerX'],R['travelerY'],0),0,1),((.8,R['carY'],R['jibTrackZ']),0,.7),((.8,R['carY'],-R['jibTrackZ']),0,.7)],
 'block':[((R['travelerX'],R['travelerY']+R['blockRise'],0),0,1),((R['mastX']-R['sheetRadius'],R['boomY']-R['blockDrop'],0),0,1),((R['pedestalX'],R['pedestalY'],0),0,1)]}
originals=[o for o in bpy.context.scene.objects if o.get('asset') in placements]
for group,items in placements.items():
 for i,(pos,rotation,scale) in enumerate(items):
  root=bpy.data.objects.new(group+' assembly '+str(i),None);bpy.context.collection.objects.link(root)
  root.location=cv(pos);root.rotation_euler.y=rotation;root.scale=(scale,scale,scale)
  for source in originals:
   if source['asset']!=group:continue
   copy=source.copy();copy.name=source.name+' assembled '+str(i);copy.parent=root
   del copy['asset'];bpy.context.collection.objects.link(copy)
for o in originals:o.hide_render=True;o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'trim-boat.blend'))
