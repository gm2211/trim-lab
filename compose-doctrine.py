import json, random
DOC=json.load(open('/private/tmp/claude-501/-Users-gmecocci-projects/917e4e06-6d54-47ab-8be6-141bf654684a/scratchpad/doctrine.json'))
sim=json.load(open('drills-gen.json'))

ACT={("mainsheet","tension"):"Sheet the main in",("mainsheet","ease"):"Ease the mainsheet",
("traveler","tension"):"Pull the traveler up to windward",("traveler","ease"):"Drop the traveler down to leeward",
("vang","tension"):"Tension the boom vang",("vang","ease"):"Ease the boom vang",
("outhaul","tension"):"Tension the outhaul",("outhaul","ease"):"Ease the outhaul",
("cunningham","tension"):"Tension the cunningham",("cunningham","ease"):"Ease the cunningham",
("backstay","tension"):"Tension the backstay",("backstay","ease"):"Ease the backstay",
("main halyard","tension"):"Tension the main halyard",("main halyard","ease"):"Ease the main halyard",
("jib sheet","tension"):"Sheet the jib in",("jib sheet","ease"):"Ease the jib sheet",
("jib car","tension"):"Slide the jib car forward",("jib car","ease"):"Slide the jib car aft",
("jib halyard","tension"):"Tension the jib halyard",("jib halyard","ease"):"Ease the jib halyard",
("reef","tension"):"Tuck in a reef"}
# NOTE: doctrine "jib car tension" = lead forward (more leech tension); ease = aft
CLAIM={("mainsheet","tension"):"close the leech and point",("mainsheet","ease"):"open the leech and let the sail breathe",
("traveler","tension"):"bring the boom up without touching twist",("traveler","ease"):"drop the boom to leeward, shape untouched",
("vang","tension"):"pin the boom down and hold the leech",("vang","ease"):"let the boom rise and the top open",
("outhaul","tension"):"stretch the foot flat",("outhaul","ease"):"deepen the lower third of the main",
("cunningham","tension"):"drag the draft forward",("cunningham","ease"):"let the luff relax and the draft settle",
("backstay","tension"):"bend the mast and flatten both sails",("backstay","ease"):"straighten the mast and power up",
("main halyard","tension"):"firm up the main's luff",("main halyard","ease"):"soften the main's luff",
("jib sheet","tension"):"trim the jib closer",("jib sheet","ease"):"give the jib room to breathe",
("jib car","tension"):"pull down on the clew and close the jib's top",("jib car","ease"):"flatten the jib's foot and open its top",
("jib halyard","tension"):"round the jib's entry",("jib halyard","ease"):"soften the jib's entry",
("reef","tension"):"shorten sail and drop the center of effort"}
ALL=list(ACT.keys())
WINDP={"light":"a soft 6 kt of breeze","medium":"11 kt of good breeze","fresh":"a fresh 16 kt","heavy":"21 kt and building"}
POSP={"close-hauled":"Close-hauled","close-reach":"On a close reach","beam-reach":"On a beam reach","broad-reach":"On a broad reach","run":"Running downwind"}

out=[]
for i,r in enumerate(DOC):
    rng=random.Random(5000+i)
    ck=(r["correct"]["line"],r["correct"]["dir"])
    banned={ck}|{(a["line"],a["dir"]) for a in r.get("also_acceptable",[])}
    opts=[{"t":ACT[ck]+" — "+CLAIM[ck],"ok":True}]
    wps=[(w["line"],w["dir"],w.get("why_wrong","")) for w in r.get("wrong_but_plausible",[]) if (w["line"],w["dir"])!=ck]
    for w in wps[:2]:
        opts.append({"t":ACT[(w[0],w[1])]+" — "+CLAIM[(w[0],w[1])],"ok":False})
    pool=[k for k in ALL if k not in banned and k[0]!="reef" and all(k!=(w[0],w[1]) for w in wps)]
    rng.shuffle(pool)
    while len(opts)<4 and pool:
        k=pool.pop()
        if k[0]==ck[0]: continue
        opts.append({"t":ACT[k]+" — "+CLAIM[k],"ok":False})
    rng.shuffle(opts)
    a=next(ix for ix,o in enumerate(opts) if o["ok"])
    s=f'{POSP[r["pos"]]} in {WINDP[r["wind"]]}: {r["symptom"]}. Which line do you reach for?'
    ww=(" "+wps[0][2]) if wps and wps[0][2] else ""
    contested=" Racers genuinely split on this one — the explanation names one good school." if r.get("contested") else ""
    e=f'{ACT[ck]}: {r["correct"]["why"]}{ww and " The tempting wrong answer — "+ACT[(wps[0][0],wps[0][1])].lower()+" — fails because:"+ww}{contested} (Per {r["source"]}.)'
    out.append({"s":s,"o":[{"t":o["t"]} for o in opts],"a":a,"e":e,"doc":r["source"]})

random.Random(7).shuffle(out)
combined=sim+out
json.dump(combined,open('drills-gen.json','w'))
print(len(sim),"sim +",len(out),"doctrine =",len(combined))
