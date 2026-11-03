#!/usr/bin/env python3
"""Inspect the embedded local SQLite schema for a lossless Planner<->game mode bridge."""
import argparse,sqlite3,zipfile,tempfile,gzip,json,re,io,sys
from pathlib import Path
a=argparse.ArgumentParser();a.add_argument("apk");opts=a.parse_args()
with zipfile.ZipFile(opts.apk) as f:
 names=[n for n in f.namelist() if n.endswith(".sqlite")]
 print("DB candidates:",names)
 if "assets/database.sqlite" not in names:sys.exit(2)
 with tempfile.NamedTemporaryFile(suffix=".sqlite") as temp:
  temp.write(f.read("assets/database.sqlite"));temp.flush()
  c=sqlite3.connect(temp.name)
  tables=c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
  for (table,) in tables:
   columns=c.execute("PRAGMA table_info("+repr(table)+")").fetchall()
   cols=[x[1] for x in columns]
   if re.search(r'project|floor|scene|plan|wall|catalog|item',table,re.I):
    print("TABLE",table,"columns",cols[:24],"rows",c.execute("SELECT count(*) FROM '"+table.replace("'","''")+"'").fetchone()[0])
   if re.search(r'project|plan',table,re.I):
    for row in c.execute("SELECT * FROM '"+table.replace("'","''")+"' LIMIT 4"):
     for col,v in zip(cols,row):
      if isinstance(v,(bytes,str)) and len(v)>60:
       data=v.encode() if isinstance(v,str) else v
       if data[:2]==b'\x1f\x8b':
        try:data=gzip.decompress(data)
        except:pass
       try:
        value=json.loads(data)
        if isinstance(value,dict):
         print("JSON",table,col,"keys",list(value)[:24])
         for key in ["floors","Floors","objects","items","Objects","scene","Project"]:
          sub=value.get(key)
          if isinstance(sub,(list,dict)):
           print("JSON CHILD",key,"count",len(sub),"first keys",list(sub[0])[:35] if isinstance(sub,list) and sub and isinstance(sub[0],dict) else list(sub)[:35] if isinstance(sub,dict) else [])
         print("SAMPLE",json.dumps(value,ensure_ascii=False)[:1200])
       except (ValueError,UnicodeDecodeError):pass
  c.close()
