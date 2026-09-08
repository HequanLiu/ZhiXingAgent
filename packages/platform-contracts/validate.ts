import type {ValueSchema} from './index.ts';
export function validateValue(schema:ValueSchema,value:unknown,depth=0):void {
 const invalid=()=>{throw new Error('VALIDATION_ERROR');};if(depth>20)invalid();
 if(schema.enum&&!schema.enum.some(v=>v===value))invalid();
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();const object=value as Record<string,unknown>;
  if(schema.required?.some(key=>!Object.hasOwn(object,key)))invalid();
  for(const[key,v]of Object.entries(object)){const child=schema.properties?.[key];if(!child){if(schema.additionalProperties===false)invalid();}else validateValue(child,v,depth+1);}
 }else if(schema.type==='array'){if(!Array.isArray(value)||value.length>1000)invalid();if(schema.items)for(const v of value as unknown[])validateValue(schema.items,v,depth+1);}
 else if(schema.type==='integer'){if(!Number.isSafeInteger(value)||schema.minimum!==undefined&&(value as number)<schema.minimum)invalid();}
 else if(schema.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||schema.minimum!==undefined&&value<schema.minimum)invalid();}
 else if(schema.type==='string'){if(typeof value!=='string'||value.length>(schema.maxLength??10000))invalid();}
 else if(typeof value!=='boolean')invalid();
}
