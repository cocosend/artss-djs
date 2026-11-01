import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Syntax gate for the source-only iOS integration; a real Codegen/Xcode build
// remains required for semantic validation against React Native headers.
for(const file of ['native/modules/artss-audio/src/NativeArtssAudio.ts','native/src/App.tsx']){
 const source=readFileSync(file,'utf8');
 const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length){for(const error of errors)console.error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText,'\n')}`);process.exitCode=1;}
 else console.log(`PASS native TypeScript parse: ${file}`);
}
