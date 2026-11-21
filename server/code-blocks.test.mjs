import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitCodeBlocks} from './public/code-blocks.mjs';

test('splits text and code while preserving code contents and languages',()=>{
  assert.deepEqual(splitCodeBlocks('Here:\n```html\n<script>\nalert(1)\n</script>\n```\nDone.'),[
    {type:'text',content:'Here:\n'}, {type:'code',language:'html',content:'<script>\nalert(1)\n</script>'}, {type:'text',content:'Done.'}
  ]);
  assert.deepEqual(splitCodeBlocks('~~~\nhello\n~~~'),[{type:'code',language:'Code',content:'hello'}]);
  assert.deepEqual(splitCodeBlocks('```js\nunfinished'),[{type:'text',content:'```js\nunfinished'}]);
  assert.deepEqual(splitCodeBlocks('````js\n```\ninside\n````'),[{type:'code',language:'js',content:'```\ninside'}]);
  assert.deepEqual(splitCodeBlocks('```js\r\nlet a = 1;\r\n```\r\n'),[{type:'code',language:'js',content:'let a = 1;'}]);
});
