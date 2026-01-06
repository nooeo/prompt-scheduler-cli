#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_BASE_URL = 'http://175.178.33.108:3001';
const DEFAULT_MODEL = 'gemini-3-pro';
const DEFAULT_SYSTEM_PROMPT = '你现在写一段话指导 AI 继续完成。如果你认为 Claude Code 已经充分完成任务，请只输出一行：[PS_TASK_STOP]。否则只输出下一条要发给 Claude Code 的指令，不要输出多余解释。';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function requestJson(url, payload, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = lib.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        if (!body) {
          return reject(new Error(`Empty response (status ${res.statusCode})`));
        }
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function extractContent(response) {
  if (!response) {
    return '';
  }

  const choice = response.choices && response.choices[0];
  if (!choice) {
    return '';
  }

  if (choice.message && typeof choice.message.content === 'string') {
    return choice.message.content;
  }

  if (typeof choice.text === 'string') {
    return choice.text;
  }

  return '';
}

async function main() {
  const apiKey = process.env.PS_REVIEWER_API_KEY;
  if (!apiKey) {
    console.error('Missing PS_REVIEWER_API_KEY');
    process.exit(1);
  }

  const baseUrl = process.env.PS_REVIEWER_API_URL || DEFAULT_BASE_URL;
  const model = process.env.PS_REVIEWER_MODEL || DEFAULT_MODEL;
  const systemPrompt = process.env.PS_REVIEWER_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    console.error('Empty stdin payload');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch (error) {
    console.error('Invalid JSON input');
    process.exit(1);
  }

  const prompt = payload.prompt || '';
  const output = payload.output || '';
  const taskIndex = payload.taskIndex || 0;
  const rootPrompt = payload.rootPrompt || '';
  const conversationHistory = payload.conversationHistory || '';
  const userContentParts = [];

  if (rootPrompt) {
    userContentParts.push(`P1 目标（创世提示词）：\n${rootPrompt}`);
    userContentParts.push('');
  }

  userContentParts.push('Claude Code 任务输出如下：');
  userContentParts.push(output);
  userContentParts.push('');
  userContentParts.push(`原始任务：${prompt}`);
  userContentParts.push('');
  userContentParts.push(`任务编号：${taskIndex}`);

  if (conversationHistory) {
    userContentParts.push('');
    userContentParts.push('Claude Code 历史记录：');
    userContentParts.push(conversationHistory);
  }

  const userContent = userContentParts.join('\n');

  const requestPayload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  };

  const url = new URL('/v1/chat/completions', baseUrl);
  const response = await requestJson(url, requestPayload, apiKey);
  const content = extractContent(response).trim();

  if (!content) {
    console.error('Empty model response');
    process.exit(1);
  }

  process.stdout.write(content);
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});
