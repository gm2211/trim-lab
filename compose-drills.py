import json, random
raw=json.load(open('drills-gen-raw.json'))

ACT={("sheet",1):"Sheet the main in",("sheet",-1):"Ease the mainsheet",
("trav",1):"Pull the traveler up to windward",("trav",-1):"Drop the traveler down to leeward",
("vang",1):"Tension the boom vang",("vang",-1):"Ease the boom vang",
("outhaul",1):"Tension the outhaul",("outhaul",-1):"Ease the outhaul",
("cunn",1):"Tension the cunningham",("cunn",-1):"Ease the cunningham",
("backstay",1):"Tension the backstay",("backstay",-1):"Ease the backstay",
("mainhal",1):"Grind the main halyard back up",("mainhal",-1):"Ease the main halyard",
("jsheet",1):"Sheet the jib in",("jsheet",-1):"Ease the jib sheet",
("jcar",1):"Slide the jib car aft",("jcar",-1):"Slide the jib car forward",
("jhal",1):"Tension the jib halyard",("jhal",-1):"Ease the jib halyard"}
CLAIM={("sheet",1):"trim the main back onto the wind",("sheet",-1):"let the leech breathe",
("trav",1):"bring the boom up to centerline without touching twist",("trav",-1):"swing the boom to leeward, shape untouched",
("vang",1):"pin the boom down and close the leech",("vang",-1):"let the boom rise and the top open",
("outhaul",1):"stretch the foot flat",("outhaul",-1):"deepen the lower third of the main",
("cunn",1):"drag the draft back forward",("cunn",-1):"let the draft float aft",
("backstay",1):"bend the mast and flatten both sails",("backstay",-1):"power both sails up",
("mainhal",1):"get the sail to full hoist and firm up the luff",("mainhal",-1):"soften the main's luff",
("jsheet",1):"pull the jib back to its slot",("jsheet",-1):"give the jib room to breathe",
("jcar",1):"flatten the jib's foot and let its head twist open",("jcar",-1):"close the top of the jib",
("jhal",1):"firm up the jib's luff and pull its draft forward",("jhal",-1):"soften the jib's entry"}
NAME={"sheet":"Mainsheet","trav":"Traveler","vang":"Boom vang","outhaul":"Outhaul","cunn":"Cunningham",
"backstay":"Backstay","mainhal":"Main halyard","jsheet":"Jib sheet","jcar":"Fairlead car","jhal":"Jib halyard"}
WINDP={"medium":"11 kt of wind","fresh":"16 kt of wind","heavy":"21 kt of wind"}
POSP={"close-hauled":"Close-hauled","close reach":"On a close reach","beam reach":"On a beam reach",
"broad reach":"On a broad reach","a run":"Running downwind"}

import random as _r
def pick(seed, opts): return _r.Random(seed).choice(opts)
def symptom(d, seed=0):
    b=d["base"]; k=d["key"]; dr=d["dir"]
    if k=="jhal" and dr==-1: return "the jib's luff has gone slack and sags off to leeward in scallops"
    if k=="jhal" and dr==1: return "the jib's luff is bar-tight with a hard vertical crease behind it"
    if k=="mainhal" and dr==-1: return "the main halyard has slipped — the sail sits low, loose and baggy"
    if b["mluff"]: return "the front of the main is bubbling and won't fill"
    if b["jluff"]: return "the jib is breaking and rattling up front"
    if b["mstall"]: return "the leech telltales have died — the air behind the main has stalled"
    if b["jstall"]: return "the jib's outside telltales hang lifeless"
    if b["dHeel"]>=4: return "the boat is heeled well past comfortable and the tiller is tugging"
    cands=[]
    cands.append((abs(b["dTw"])/6, pick(seed+1,["the top of the main has twisted wide open and dumps its wind","the head of the main falls off to leeward, spilling everything aloft"]) if b["dTw"]>0 else pick(seed+2,["the main's leech is strapped shut — the top looks hooked","the top batten hooks to windward; the leech never breathes"])))
    cands.append((abs(b["dDep"])/2.5, "the main looks deep and baggy" if b["dDep"]>0 else "the main is board-flat with no punch"))
    cands.append((abs(b["dDr"])/4, pick(seed+3,["the deepest part of the main has crept aft toward the leech and the helm feels heavy","the main has gone round-backed — its belly sits aft and the tiller loads up"]) if b["dDr"]>0 else "the main's draft is dragged hard forward with a flat, closed back"))
    cands.append((abs(b["jdTw"])/6, "the top of the jib twists off and spills" if b["jdTw"]>0 else "the jib's leech is closed hard against the main"))
    cands.append((abs(b["jdDep"])/2.5, "the jib looks round and full as a spinnaker" if b["jdDep"]>0 else "the jib is stretched flat"))
    if b["dHeel"]<=-3: cands.append((abs(b["dHeel"])/3,"the boat sails strangely flat and sluggish"))
    cands.sort(key=lambda x:-x[0])
    return cands[0][1] if cands and cands[0][0]>=1 else "something in the trim looks wrong and the boat is slow"

def lossphrase(l):
    if l>=8: return "You're well off the pace"
    if l>=4: return "You're clearly off the pace"
    return "It's costing you a little pace"

# dedupe: keep best-loss per (pos,key,dir)
groups={}
for d in raw:
    groups.setdefault((d["pos"],d["key"],d["dir"]),[]).append(d)
picked=[]
for kk,ds in groups.items():
    ds.sort(key=lambda x:-x["loss"])
    picked.append(ds[0])
    for d in ds[1:]:
        if d["wind"]!=ds[0]["wind"]:
            picked.append(d); break

out=[]
for i,d in enumerate(sorted(picked,key=lambda x:(x["twa"],x["key"]))):
    rng=random.Random(1234+i)
    correct={"t":ACT[(d["key"],d["correct"]["d2"])]+" — "+CLAIM[(d["key"],d["correct"]["d2"])],
             "dSpd":d["correct"]["dSpd"],"dHeel":d["correct"]["dHeel"],"ok":True}
    opts=[correct]
    for x in d["distractors"][:3]:
        opts.append({"t":ACT[(x["j"],x["d2"])]+" — "+CLAIM[(x["j"],x["d2"])],
                     "dSpd":x["dSpd"],"dHeel":x["dHeel"],"ok":False})
    rng.shuffle(opts)
    a=next(idx for idx,o in enumerate(opts) if o["ok"])
    s=f'{POSP[d["pos"]]} in {WINDP[d["wind"]]}: {symptom(d,seed=i)}. {lossphrase(d["loss"])} — which line do you reach for?'
    heel=d["correct"]["dHeel"]
    hc= f" and takes about {abs(heel):.0f}° of heel off" if heel<=-1.5 else (f" and stands the boat up into its power (heel +{heel:.0f}°)" if heel>=1.5 else "")
    also=""
    if d["also"]:
        x=d["also"][0]
        also=f' {ACT[(x["j"],x["d2"])]} works too ({x["dSpd"]:+.1f} kt) — pick whichever hand is free.'
    top=d["distractors"][0]
    td=f' {ACT[(top["j"],top["d2"])]}, the most tempting wrong answer, {"makes it worse" if top["dSpd"]<-0.05 else "does nothing for this problem"}.'
    g=d["correct"]["dSpd"]
    if g>=0.15:
        gain=f'In this exact setup the simulator measures that one move buying back {g:+.1f} kt{hc}.'
    else:
        gain=f'The gain is small but real — this is a shape fix, not a throttle: the sail returns to its designed form and the helm settles{hc}.'
    e=(f'{ACT[(d["key"],d["correct"]["d2"])]} to {CLAIM[(d["key"],d["correct"]["d2"])]}. '
       f'{gain}{also}{td} (Line: {NAME[d["key"]]}.)')
    out.append({"s":s,"o":[{"t":o["t"],"dSpd":(0.0 if abs(o["dSpd"])<0.05 else o["dSpd"]),"dHeel":(0.0 if abs(o["dHeel"])<0.05 else o["dHeel"])} for o in opts],"a":a,"e":e,
                "sim":{"tws":d["tws"],"twa":d["twa"],"state":d["state"],"hi":d["key"]}})
json.dump(out,open("drills-gen.json","w"),indent=None)
print(len(out),"composed;")
import collections
print(collections.Counter((x["sim"]["twa"]) for x in out))
