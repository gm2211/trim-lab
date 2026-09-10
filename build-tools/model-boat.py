"""Author the visible boat and hardware in Blender, export evaluated meshes.
Blender --background --factory-startup --python build-tools/model-boat.py
Coordinates in this script are boat x=forward, y=up, z=port; converted for Blender.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'boat'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M={}
for name,color,metal,rough in [
 ('gelcoat',(.81,.85,.83),0,.24),('nonskid',(.53,.59,.56),0,.83),
 ('steel',(.64,.71,.74),.92,.21),('anodized',(.19,.24,.27),.82,.29),
 ('rubber',(.018,.027,.030),0,.65),('sheave',(.17,.19,.16),.12,.40),
 ('glass',(.028,.09,.11),.4,.16),('stripe',(.013,.11,.15),.15,.3),
 ('canvas',(.19,.23,.21),0,.94),('interior',(.39,.46,.44),0,.75)]:
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

def shape(t,u):
 x=3.925-t*7.85
 half=1.28*math.sin(math.pi*max(0,min(.93,t*1.06)))**.62
 dep=.5*math.sin(math.pi*max(0,min(1,.1+.85*t)))**.75
 return (x,-dep+(.72-.05*math.sin(math.pi*t)+dep)*abs(u)**1.7,half*(1 if u>=0 else -1)*abs(u)**.75)
verts=[shape(i/48,j/16*2-1) for i in range(49) for j in range(17)]
faces=[(i*17+j,i*17+j+1,(i+1)*17+j+1,(i+1)*17+j) for i in range(48) for j in range(16)]
hull=mesh('Fair fiberglass hull',verts,faces,'gelcoat',sub=1)
mod=hull.modifiers.new('Hull laminate','SOLIDIFY');mod.thickness=.025
# Rounded aft cap, closed below the open cockpit.
stern=[shape(1,j/16*2-1) for j in range(17)]
mesh('Rounded transom',stern,[tuple(range(17))],'gelcoat')
# Bow deck, aft bridge and shaped side decks with moulded cockpit well.
for name,ts in [('Foredeck',[i/48 for i in range(25)]),('Aft bridge',[i/48 for i in range(45,49)])]:
 rows=[[shape(t,-1),shape(t,1)] for t in ts]
 mesh(name,[p for r in rows for p in r],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(rows)-1)],'gelcoat')
for side in [-1,1]:
 rows=[]
 for i in range(24,46):
  t=i/48;rail=shape(t,side);x,y,z=rail
  rows.append([rail,(x,y,side*.62),(x,.36,side*.62)])
 mesh('Cockpit coaming '+str(side),[p for row in rows for p in row],[(3*i+j,3*i+j+1,3*(i+1)+j+1,3*(i+1)+j) for i in range(len(rows)-1) for j in range(2)],'gelcoat')
 box('Moulded seat '+str(side),(-1.74,.61,side*.85),(3.1,.14,.40),'gelcoat',.06)
 box('Seat nonskid '+str(side),(-1.72,.687,side*.85),(2.94,.008,.28),'nonskid',.035)
 box('Side deck grip '+str(side),(.34,.717,side*.98),(1.04,.009,.25),'nonskid',.05)
 box('Cockpit foot rail '+str(side),(-1.72,.375,side*.38),(2.9,.05,.07),'gelcoat',.025)
 # Rubber hull/deck joint, no floating painted stripe.
 tube('Gunwale bumper '+str(side),[shape(i/48,side) for i in range(1,49)],.024,'rubber')
 tube('Hull cove stripe '+str(side),[shape(i/48,side*.94) for i in range(1,49)],.012,'stripe')
box('Cockpit sole',(-1.72,.335,0),(3.30,.06,1.20),'interior',.06)
box('Cockpit floor grip',(-1.72,.37,0),(3.1,.008,1.04),'nonskid',.045)
# Low, tapered coachroof with softened corners; matches rope-clearance envelope.
vs=[]
for x,width,top in [(.8,.74,1.02),(2.35,.46,.96)]:
 vs += [(x,.66,-width),(x,.66,width),(x,top,width-.07),(x,top+.035,0),(x,top,-width+.07)]
cabin=mesh('Moulded tapered coachroof',vs,[(0,1,2,3,4),(9,8,7,6,5)]+[(j,(j+1)%5,(j+1)%5+5,j+5) for j in range(5)],'gelcoat')
mod=cabin.modifiers.new('Coachroof fillets','BEVEL');mod.width=.055;mod.segments=5
mod=cabin.modifiers.new('Roof normals','WEIGHTED_NORMAL')
box('Coachroof grip',(1.54,1.027,0),(1.23,.009,.80),'nonskid',.07)
box('Hatch frame',(1.95,1.05,0),(.50,.045,.48),'anodized',.035)
box('Smoked hatch lens',(1.95,1.079,0),(.435,.015,.415),'glass',.03)
box('Companionway surround',(.783,.815,0),(.04,.29,.63),'rubber',.03)
box('Companionway washboard',(.757,.817,0),(.015,.245,.56),'glass',.02)
# Thin tapered foils rather than rectangular underwater boxes.
for name,x,z0,chord,span in [('Keel',-.2,-.4,1.3,1.1),('Rudder',-3.42,.15,.5,1.15)]:
 vv=[]
 for y,c in [(z0,chord),(z0-span,chord*.65)]:
  for j in range(32):
   a=2*math.pi*j/32;vv.append((x+c*.5*math.cos(a),y,.075*math.sin(a)))
 mesh(name,[(vx-x,vy-z0,vz) for vx,vy,vz in vv] if name=='Rudder' else vv,[(j,(j+1)%32,(j+1)%32+32,j+32) for j in range(32)]+[tuple(range(31,-1,-1)),tuple(range(32,64))],'gelcoat',asset='rudder' if name=='Rudder' else 'boat',sub=1)
# Rigid cockpit rails and carefully radiused pulpit.
for side in [-1,1]:
 pts=[(-3.5,.72,side*.92),(-3.5,1.18,side*.92),(-2.4,1.18,side*1.19),(-.9,1.16,side*1.20),(-.15,1.14,side*1.13)]
 tube('Cockpit safety rail '+str(side),pts,.016,'steel')
 for x,z in [(-2.4,1.19),(-.9,1.20),(-.15,1.13),(2.2,.98)]:
  cylinder('Stanchion socket',(x,.715,side*z),.045,.025,'steel')
  tube('Stanchion',[(x,.72,side*z),(x,1.16,side*z)],.012,'steel')
 tube('Bow pulpit '+str(side),[(3.08,.73,side*.41),(3.08,1.15,side*.39),(3.62,1.19,side*.2),(3.83,1.18,0)],.016,'steel')
# Aluminum traveler extrusion with fasteners and end stops.
box('Traveler beam',(-.95,.96,0),(.065,.07,1.72),'anodized',.009)
box('Traveler running rail',(-.95,1.001,0),(.048,.015,1.65),'steel',.004)
for side in [-1,1]:
 box('Traveler riser',(-.95,.83,side*.81),(.12,.24,.10),'anodized',.02)
 box('Traveler end stop',(-.95,1.005,side*.82),(.09,.05,.08),'rubber',.013)
 # Jib tracks: the geometry and the model still share the .6 .. -.2 car travel.
 box('Jib track',(.2,.718,side*.62),(.96,.035,.07),'anodized',.007)
 for i in range(10):cylinder('Track countersunk screw',(-.23+i*.095,.74,side*.62),.008,.003,'steel')
 # Winches: flared base, ribbed drum, polished self-tailer and socket.
 x,z=-.72,side*.84
 cylinder('Winch mounting plinth',(x,.758,z),.125,.07,'gelcoat')
 cylinder('Winch base',(x,.804,z),.115,.03,'anodized')
 cylinder('Winch drum',(x,.88,z),.084,.13,'anodized',r2=.078)
 for i in range(6):torus('Drum grip ring',(x,.83+i*.018,z),.085,.003,'rubber')
 cylinder('Self tailer',(x,.96,z),.099,.035,'steel')
 torus('Winch top lip',(x,.98,z),.083,.006,'steel')
 cylinder('Winch socket',(x,.981,z),.019,.007,'rubber')
 # Deck organizer and four separate lead lanes, fully supported above deck.
 for lane in range(3):
  z=side*(.14+lane*.07)
  cylinder('Organizer sheave',(.44,.765,z),.038,.025,'sheave')
  box('Organizer cap',(.44,.785,z),(.10,.012,.055),'anodized',.016)
  box('Rope clutch body',(-.04,.78,z),(.20,.085,.05),'rubber',.015)
  lever=box('Clutch lever',(-.045,.835,z),(.16,.02,.038),'anodized',.008)
  lever.rotation_euler.y=-.10
# Open fabric pockets collect the led-aft controls; no loose spaghetti on deck.
for side in [-1,1]:
 box('Line pocket',(-.19,.60,side*.25),(.16,.27,.30),'canvas',.05)
 box('Pocket opening',(-.19,.741,side*.25),(.12,.008,.25),'rubber',.025)
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
# A stainless eye / shackle makes the connection visible.
torus('Block shackle',(0,.11,0),.032,.007,'steel','block',axis='z')
box('Mast extrusion',(0,0,0),(.14,10.6,.095),'steel',.044,'mast')
box('Mast sail track',(-.077,0,0),(.016,10.5,.028),'rubber',.006,'mast')
box('Boom extrusion',(0,0,0),(.12,3.4,.095),'steel',.035,'boom')
box('Boom upper track',(.064,0,0),(.012,3.30,.035),'rubber',.004,'boom')
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
result={'generator':'Blender '+bpy.app.version_string,'assets':{}}
for (asset,mat),data in assets.items():result['assets'].setdefault(asset,[]).append({'material':mat,**data})
(OUT/'meshes.json').write_text(json.dumps(result,separators=(',',':')))
print('EXPORTED',sum(len(a['indices'])//3 for a in assets.values()),'triangles',[(k,len(v)) for k,v in result['assets'].items()])

# Keep prototype local coordinates for export, but present an assembled model
# when the .blend opens. Linked copies preserve editable modifier stacks.
placements={
 'mast':[((.72,6,0),0,1)], 'boom':[((-.98,1.42,0),-math.pi/2,1)],
 'rudder':[((-3.42,.15,0),0,1)],
 'car':[((-.95,1,0),0,1),((.2,.75,.62),0,.7),((.2,.75,-.62),0,.7)],
 'block':[((-.95,1.1,0),0,1),((-.98,1.32,0),0,1),((.2,.81,.62),0,.65),((.2,.81,-.62),0,.65)]}
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
