#!/usr/bin/env python3
"""Append a second Android launcher activity in compiled AndroidManifest.xml.

Does NOT replace com.planner5d.library.activity.Main, permissions, package,
project format, billing, licensing or other components. Supports the UTF16
style-free AXML string pool present in the user's Planner 2.101.0 APK.
"""
import struct,sys

RD=lambda b,p:struct.unpack_from('<I',b,p)[0]
P32=lambda x:struct.pack('<I',x)
NO_NS=0xffffffff

def strings_of(data,pool_start=8):
 t,hs,size=struct.unpack_from('<HHI',data,pool_start)
 if t!=1 or hs!=28:raise ValueError('Unexpected string pool')
 count,style,flags,ss,st=struct.unpack_from('<IIIII',data,pool_start+8)
 if style or flags or st:raise ValueError('Expected UTF16, no style spans')
 result=[]
 for i in range(count):
  offset=RD(data,pool_start+hs+4*i);p=pool_start+ss+offset
  n=struct.unpack_from('<H',data,p)[0];p+=2
  if n&0x8000:n=((n&0x7fff)<<16)|struct.unpack_from('<H',data,p)[0];p+=2
  result.append(data[p:p+n*2].decode('utf-16le'))
 return result

def node_start(name_id,attributes=()):
 size=36+20*len(attributes)
 b=bytearray(struct.pack('<HHIII',0x102,16,size,0,NO_NS))
 b+=struct.pack('<IIHHHHHH',NO_NS,name_id,20,20,len(attributes),0,0,0)
 for namespace,att_name,raw,dtype,value in attributes:
  b+=struct.pack('<IIIHBBI',namespace,att_name,raw,8,0,dtype,value)
 assert len(b)==size
 return bytes(b)

def node_end(name_id):
 return struct.pack('<HHIIII',0x103,16,24,0,NO_NS,NO_NS)+P32(name_id)

def patch(data):
 b=bytes(data)
 if b[:2]!=b'\x03\x00':raise ValueError('Not compiled Android XML')
 texts=strings_of(b);indexes={v:i for i,v in enumerate(texts)}
 new_texts=['com.phoenix3d.tools.PhoenixToolsActivity','Phoenix 3D Tools']
 to_add=[s for s in new_texts if s not in indexes]
 if len(to_add)!=2:raise ValueError('Already patched manifest, or conflicting class')
 pool=8;t,hs,pool_size=struct.unpack_from('<HHI',b,pool)
 count,style,flags,ss,st=struct.unpack_from('<IIIII',b,pool+8)
 new_data=bytearray();new_offsets=[];old_data=b[pool+ss:pool+pool_size]
 for value in to_add:
  indexes[value]=count+len(new_offsets);new_offsets.append(len(old_data)+len(new_data))
  encoded=value.encode('utf-16le')
  new_data+=struct.pack('<H',len(encoded)//2)+encoded+b'\0\0'
 while len(new_data)%4:new_data+=b'\0'
 new_pool=bytearray(b[pool:pool+hs])
 new_pool+=b[pool+hs:pool+ss]
 new_pool+=b''.join(P32(v) for v in new_offsets)
 new_pool+=old_data+new_data
 struct.pack_into('<I',new_pool,4,len(new_pool))
 struct.pack_into('<I',new_pool,8,count+len(to_add))
 struct.pack_into('<I',new_pool,20,ss+len(to_add)*4)
 if len(new_pool)%4:raise ValueError('AXML string pool not aligned')
 ns=indexes['http://schemas.android.com/apk/res/android']
 name=indexes['name'];exported=indexes['exported'];label=indexes['label']
 activity=indexes['activity'];filter_id=indexes['intent-filter']
 action=indexes['action'];category=indexes['category']
 main=indexes['android.intent.action.MAIN'];launcher=indexes['android.intent.category.LAUNCHER']
 def string_att(k,v):return (ns,k,v,3,v)
 def bool_att(k,yes):return (ns,k,NO_NS,0x12,1 if yes else 0)
 nodes=(
  node_start(activity,[string_att(name,indexes[new_texts[0]]),
                       bool_att(exported,True),string_att(label,indexes[new_texts[1]])])+
  node_start(filter_id)+
  node_start(action,[string_att(name,main)])+node_end(action)+
  node_start(category,[string_att(name,launcher)])+node_end(category)+
  node_end(filter_id)+node_end(activity)
 )
 pos=8;stack=[];app_close=None
 while pos<len(b):
  kind,hs,sz=struct.unpack_from('<HHI',b,pos)
  if kind==0x102:stack.append(texts[RD(b,pos+20)])
  elif kind==0x103:
   if stack and stack[-1]=='application':app_close=pos;break
   if stack:stack.pop()
  if sz<8:raise ValueError('Invalid XML chunk')
  pos+=sz
 if app_close is None:raise ValueError('No application closing XML node')
 updated=bytearray(b[:pool]+new_pool+b[pool+pool_size:app_close]+nodes+b[app_close:])
 struct.pack_into('<I',updated,4,len(updated))
 return bytes(updated)

if __name__=='__main__':
 source,destination=sys.argv[1:3]
 with open(source,'rb') as inp:before=inp.read()
 after=patch(before)
 with open(destination,'wb') as out:out.write(after)
 print('Manifest patched',len(before),'->',len(after))
