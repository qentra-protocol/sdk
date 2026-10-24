import pathlib,subprocess,os,json,hashlib,tarfile,shutil
root=pathlib.Path.cwd();work=root/'.package-proof';work.mkdir(exist_ok=True)
source_receipt=json.loads((root.parent/'ACQUISITION.json').read_text())
receipt={'status':'running','revision':source_receipt['candidate'],'workflow_revision':os.environ.get('GITHUB_SHA'),'acquisition':source_receipt,'run_url':'https://github.com/'+os.environ.get('GITHUB_REPOSITORY','')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID',''),'checks':[],'artifacts':[],'scope':'synthetic packaged consumer; no live funds or validator'}
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
 assert sha(archive)=='4b295cdb34ea38847cbcd655d6b2fabec629b7424f756ba19a7eec0fc1127d91','core courier changed'
 core=work/'core';core.mkdir(exist_ok=True)
 with tarfile.open(archive) as t:
  for m in t.getmembers():
   assert m.uid==m.gid==0 and not m.uname and not m.gname,'archive owner metadata'
   assert not m.issym() and not m.islnk() and not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts
  t.extractall(core,filter='data')
 receipt['core_source_sha256']=sha(core/'src/index.ts');receipt['core_courier_sha256']=sha(archive);receipt['credential_environment_absent']=True;save()
 run('core install',['npm','install','--ignore-scripts','--no-audit','--no-fund'],core)
 run('core checks',['npm','run','check'],core)
 run('core pack',['npm','pack','--ignore-scripts'],core)
 coretar=core/'qentra-core-0.2.0-dev.0.tgz'
 coreonly=work/'core-only';coreonly.mkdir(exist_ok=True);(coreonly/'package.json').write_text('{"private":true,"type":"module"}\n')
 shutil.copyfile(root/'examples/core-proof-consumer.mjs',coreonly/'core-proof-consumer.mjs')
 run('core-only fresh install',['npm','install','--ignore-scripts','--no-audit','--no-fund',str(coretar)],coreonly)
 run('installed core-only saved proof recipient',['node','core-proof-consumer.mjs'],coreonly)
 receipt['core_only_proof']=json.loads((coreonly/'core-proof-receipt.json').read_text());save()
 run('sdk install',['npm','install','--ignore-scripts','--no-save','--no-audit','--no-fund',str(coretar)],root)
 run('sdk checks',['npm','run','check'],root)
 run('sdk pack',['npm','pack','--ignore-scripts'],root)
 sdktar=root/'qentra-sdk-0.3.0-dev.0.tgz'
 consumer=work/'consumer';consumer.mkdir(exist_ok=True);(consumer/'package.json').write_text('{"private":true,"type":"module"}\n')
 shutil.copyfile(root/'examples/packed-consumer.mjs',consumer/'packed-consumer.mjs')
 run('fresh consumer install',['npm','install','--ignore-scripts','--no-audit','--no-fund',str(coretar),str(sdktar)],consumer)
 shutil.copyfile(root/'examples/shared-proof-consumer.mjs',consumer/'shared-proof-consumer.mjs')
 run('installed shared function identity',['node','shared-proof-consumer.mjs'],consumer)
 run('fresh packed consumer',['node','packed-consumer.mjs'],consumer)
 shutil.copyfile(root/'examples/offline-proof-consumer.mjs',consumer/'offline-proof-consumer.mjs')
 run('installed offline proof-file CLI consumer',['node','offline-proof-consumer.mjs'],consumer)
 shutil.copyfile(root/'examples/recovery-consumer.mjs',consumer/'recovery-consumer.mjs')
 run('installed interrupted draw fresh-process recovery',['node','recovery-consumer.mjs'],consumer)
 receipt['interrupted_draw']=json.loads((consumer/'interrupted-draw-receipt.json').read_text());save()
 installed_recipe=consumer/'node_modules/@qentra/sdk/examples/allocation-draw.mjs'
 assert installed_recipe.read_bytes()==(root/'examples/allocation-draw.mjs').read_bytes(),'packed recipe differs from complete source'
 receipt['installed_recipe']={'path':'node_modules/@qentra/sdk/examples/allocation-draw.mjs','sha256':sha(installed_recipe),'bytes':installed_recipe.stat().st_size};save()
 allocation=consumer/'allocation';allocation.mkdir(exist_ok=True)
 shutil.copyfile(root/'examples/allocation-consumer.mjs',allocation/'allocation-consumer.mjs')
 # Resolve packed recipe via the consumer's installed node_modules, never source imports.
 shutil.copytree(consumer/'node_modules',allocation/'node_modules',symlinks=True)
 run('installed allocation recipe fresh-process recovery',['node','allocation-consumer.mjs'],allocation)
 receipt['allocation_recipe']=json.loads((allocation/'allocation-receipt.json').read_text());save()
 installed_wait=consumer/'node_modules/@qentra/sdk/examples/wait-and-reopen.mjs'
 assert installed_wait.read_bytes()==(root/'examples/wait-and-reopen.mjs').read_bytes(),'packed wait example differs'
 receipt['installed_wait_example']={'path':'node_modules/@qentra/sdk/examples/wait-and-reopen.mjs','sha256':sha(installed_wait),'bytes':installed_wait.stat().st_size};save()
 shutil.copyfile(root/'examples/wait-consumer.mjs',consumer/'wait-consumer.mjs')
 run('installed bounded native draw wait and reopen',['node','wait-consumer.mjs'],consumer)
 receipt['bounded_wait']=json.loads((consumer/'wait-receipt.json').read_text());save()
 (consumer/'proof-types.ts').write_text("import { parseProofFile, exportProofFile, verifyProofFile, type ProtocolRecord, type OfflineProofVerification } from '@qentra/sdk';\nimport { parseProofFile as subpath } from '@qentra/sdk/proof';\nasync function journey(text: string) { const r: ProtocolRecord = await parseProofFile(text); const json: string = await exportProofFile(r); const v: OfflineProofVerification = await verifyProofFile(await subpath(json)); return v.mapping.result; }\nimport { QVRFClient, parseRecoveryCheckpoint, type RecoveryCheckpoint, type RecoveryResult } from '@qentra/sdk';\nasync function recover(client: QVRFClient, text: string) { const c: RecoveryCheckpoint = await parseRecoveryCheckpoint(text); const r: RecoveryResult = await client.recoverRequest(c); return r.state; }\n")
 run('installed proof-file declarations',['node',str(root/'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','proof-types.ts'],consumer)
 for p in [coretar,sdktar,core/'package-lock.json',consumer/'package-lock.json']:
  receipt['artifacts'].append({'path':str(p.relative_to(root)),'sha256':sha(p)})
 shutil.copyfile(coretar,root/coretar.name)
 receipt['status']='passed';save()
except Exception as e:
 receipt['status']='failed';receipt['blocker']=str(e);save();raise
