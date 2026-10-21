import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {isOutsideDirectory} from './lab13-support.mjs';

const cases=[
 ['Windows different drive',path.win32,'D:/a/cli/cli','C:/Temp/consumer',true],
 ['Windows outside spaced directory',path.win32,'C:/repo project','C:/Temp/consumer project',true],
 ['Windows parent',path.win32,'C:/repo','C:/',true],
 ['Windows nested child',path.win32,'C:/repo','C:/repo/consumer',false],
 ['Windows dot-prefix child',path.win32,'C:/repo','C:/repo/..internal',false],
 ['Windows same root',path.win32,'C:/repo','C:/repo',false],
 ['Windows case-insensitive child',path.win32,'C:/Repo','c:/repo/site',false],
 ['POSIX temporary directory',path.posix,'/home/project','/tmp/consumer',true],
 ['POSIX sibling',path.posix,'/home/project','/home/project-other',true],
 ['POSIX nested child',path.posix,'/home/project','/home/project/site',false],
 ['POSIX dot-prefix child',path.posix,'/home/project','/home/project/..internal',false],
 ['POSIX same root',path.posix,'/home/project','/home/project',false],
 ['relative root rejected',path.posix,'project','/tmp/consumer',false],
 ['relative target rejected',path.posix,'/home/project','consumer',false],
];
for(const [name,api,root,target,expected]of cases)test(name,()=>assert.equal(isOutsideDirectory(root,target,api),expected));
