// ----------------------------------------------
// ⚙️ [配置]
// ----------------------------------------------
const SERVER_API_URL = "https://your-domain.com/api/new-sms"; 
// ----------------------------------------------

/**
 * [最终版本]
 * 主函数：检查邮件并转发
 * - 修复了 originalTimestamp (解决 500 错误)
 * - 修复了 is:unread (解决重复发送)
 */
function checkGmailAndForward() {
  Logger.log('开始检查 Gmail (目标: Python VPS)...');
  
  // [修复 1] 必须包含 is:unread 来防止重复
  const query = 'from:voice-noreply@google.com newer_than:1d is:unread';

  // [不变] 只获取最新的 1 条未读
  const threads = GmailApp.search(query, 0, 3);

  if (threads.length > 0) {
      Logger.log(`找到 ${threads.length} 条未读线索。`);
  }

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    const message = messages[messages.length - 1]; 
    
    // [修复 2] 必须标记为已读
    thread.markRead(); 

    try {
      const fromAddress = message.getFrom();
      const subject = message.getSubject();
      let plainBody = message.getPlainBody();
      
      // [使用智能函数]
      let senderNumber = parseNumberFromSubject(subject) || parseNumberFromFrom(fromAddress) || 'Unknown';
      let messageContent = parseMessageContent(plainBody);

      if (!messageContent) continue; // 如果内容为空(被过滤)，则跳过

      // [!!! 修复 3: 解决 500 错误的核心 !!!]
      // 1. 获取原始邮件的收件时间
      const originalDate = message.getDate();
      // 2. 将其转换为 ISO 字符串
      const originalTimestamp = originalDate.toISOString(); 
      
      const payload = {
        from: senderNumber,
        message: messageContent,
        originalTimestamp: originalTimestamp // 3. 必须包含此字段
      };
      // (payload 修改结束)

      const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload)
      };

      UrlFetchApp.fetch(SERVER_API_URL, options); 

      Logger.log(`数据已发送并标记为已读: ${originalTimestamp}`);

    } catch (e) {
      Logger.log(`处理邮件时出错: ${e.toString()}`);
    }
  }
}

// ----------------------------------------------
// 辅助函数 (智能版本)
// ----------------------------------------------

/**
 * [智能版] 智能解析“发件人” (来自 Subject)
 * 匹配 "from " 之后的所有字符, 无论是号码还是 "Apple"
 */
function parseNumberFromSubject(subject) {
  const match = subject.match(/New text message from (.+)/i); 
  if (match && match[1]) {
    return match[1].trim(); // 返回 "942657" 或 "+1234567890" 等
  }
  return null;
}

/**
 * [备用] 从 From 地址解析 (基本不变)
 */
function parseNumberFromFrom(fromAddress) {
  const match = fromAddress.match(/<(\d+)@txt\.voice\.google\.com>/);
  return (match && match[1]) ? ('+1' + match[1]) : null;
}

/**
 * [智能版] 智能解析邮件正文 (混合过滤)
 * 优先返回验证码行，否则返回清理后的内容
 */
function parseMessageContent(body) {
  
  let mainBlock = body.split('\n\nTo reply to this message')[0];
  mainBlock = mainBlock.split('\n---\n')[0];
  mainBlock = mainBlock.replace(/Legacy Conversation:\s*/, '');
  mainBlock = mainBlock.trim();

  const lines = mainBlock.split('\n');
  const codeLines = [];
  const goodLines = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();

    // --- 逐行过滤 (B计划) ---
    if (trimmedLine === '') continue; 
    if (trimmedLine.startsWith('<http')) continue; 
    if (trimmedLine.startsWith('http')) continue; 
    if (trimmedLine.startsWith('您的帐号')) continue; 
    if (trimmedLine.startsWith('您收到此电子邮件')) continue; 
    if (trimmedLine.startsWith('Google LLC')) continue; 
    if (trimmedLine.startsWith('Amphitheatre')) continue; 
    if (trimmedLine.match(/^\d{4,}\s+Amphitheatre/)) continue; 

    goodLines.push(trimmedLine);

    // --- 优先提取 (A计划) ---
    const hasCodeNumber = /\b\d{4,8}\b/.test(trimmedLine);
    const hasCodeWord = /code|代码|验证码|codice|código|PIN/i.test(trimmedLine);
    
    if (hasCodeNumber && hasCodeWord) {
      codeLines.push(trimmedLine);
    }
  }

  // --- 决策 ---
  if (codeLines.length > 0) {
    Logger.log('策略 A: 成功提取验证码行。');
    return codeLines.join('\n');
  } else {
    Logger.log('策略 B: 未找到验证码，返回清理后的常规内容。');
    return goodLines.join('\n');
  }
}
