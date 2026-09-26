import fs from 'node:fs';
import {validateRegistry} from '../lib/research.js';
const registry=validateRegistry(JSON.parse(fs.readFileSync('research/sources.json','utf8')));
const queue=JSON.parse(fs.readFileSync('research/queue.json','utf8'));
if(queue.schemaVersion!==1||!Array.isArray(queue.candidates)||!Array.isArray(queue.runs))throw Error('Invalid research queue');
console.log(`[research] PASS: ${registry.sources.length} registered sources, ${queue.candidates.length} queued candidates`);
