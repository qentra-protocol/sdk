import pathlib,subprocess,os,json,hashlib,tarfile,shutil
root=pathlib.Path.cwd();work=root/'.package-proof';work.mkdir(exist_ok=True)
receipt={'status':'running','revision':os.environ.get('GITHUB_SHA'),'run_url':'https://github.com/'+os.environ.get('GITHUB_REPOSITORY','')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID',''),'checks':[],'artifacts':[],'scope':'synthetic packaged consumer; no live funds or validator'}
def save(): (root/'package-proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(name,args,cwd):
 code=subprocess.run(args,cwd=cwd).returncode;receipt['checks'].append({'name':name,'exit_code':code});save()
 if code: raise RuntimeError('check failed: '+name)
try:
 assert os.environ.get('GITHUB_ACTIONS')=='true','remote provider required'
 assert not any(os.environ.get(k) for k in ['GH_TOKEN','GITHUB_TOKEN','NODE_AUTH_TOKEN','NPM_TOKEN','HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY']),'credential-bearing environment'
 assert not (pathlib.Path.home()/'.npmrc').exists() and not (pathlib.Path.home()/'.netrc').exists(),'credential file'
 archive=root/'tests/fixtures/core-source.tgz'
 assert sha(archive)=='f484a43d595afecef0b45f9a372ebc376cb339399a1f8644afdf39b1012064f6','core courier changed'
 core=work/'core';core.mkdir(exist_ok=True)
 with tarfile.open(archive) as t:
  for m in t.getmembers():
   assert m.uid==m.gid==0 and not m.uname and not m.gname,'archive owner metadata'
   assert not m.issym() and not m.islnk() and not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts
  t.extractall(core,filter='data')
 receipt['core_source_sha256']=sha(core/'src/index.ts');receipt['core_courier_sha256']=sha(archive);receipt['credential_environment_absent']=True;save()
 run('core install',['npm','install','--no-audit','--no-fund'],core)
 run('core checks',['npm','run','check'],core)
 run('core pack',['npm','pack'],core)
 coretar=core/'qentra-core-0.1.0-dev.0.tgz'
 run('sdk install',['npm','install','--no-save','--no-audit','--no-fund',str(coretar)],root)
 run('sdk checks',['npm','run','check'],root)
 run('sdk pack',['npm','pack'],root)
 sdktar=root/'qentra-sdk-0.2.0-dev.0.tgz'
 consumer=work/'consumer';consumer.mkdir(exist_ok=True);(consumer/'package.json').write_text('{"private":true,"type":"module"}\n')
 shutil.copyfile(root/'examples/packed-consumer.mjs',consumer/'packed-consumer.mjs')
 run('fresh consumer install',['npm','install','--no-audit','--no-fund',str(coretar),str(sdktar)],consumer)
 run('fresh packed consumer',['node','packed-consumer.mjs'],consumer)
 for p in [coretar,sdktar,core/'package-lock.json',root/'package-lock.json']:
  receipt['artifacts'].append({'path':str(p.relative_to(root)),'sha256':sha(p)})
 shutil.copyfile(coretar,root/coretar.name)
 receipt['status']='passed';save()
except Exception as e:
 receipt['status']='failed';receipt['blocker']=str(e);save();raise
