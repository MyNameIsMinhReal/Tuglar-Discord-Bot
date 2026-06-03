import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ── Q&A / Hỏi đáp ─────────────────────────────────────────────────
export async function askQuestion(question: string, subject?: string): Promise<string> {
  const systemPrompt = `Bạn là trợ lý học tập thông minh và thân thiện dành cho học sinh/sinh viên Việt Nam.
Hãy:
- Trả lời như đang nói chuyện với bạn bè, tự nhiên, dùng tiếng Việt thân mật (mình/bạn). Giải thích dễ hiểu, có ví dụ
- Dùng emoji phù hợp để bài viết sinh động
- Nếu cần công thức, trình bày rõ ràng từng bước
- Không dùng bullet point quá nhiều, viết tự nhiên như đang giải thích cho bạn nghe. Khoảng 200-400 từ
${subject ? `Môn học hiện tại: **${subject}**` : ''}`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể lấy phản hồi';
}

// ── Quiz Generation ────────────────────────────────────────────────
export async function generateQuiz(topic: string, count = 5): Promise<any[]> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: 'Bạn là giáo viên tạo câu hỏi trắc nghiệm cho học sinh. Chỉ trả về JSON array, không có markdown hay text thêm. Nếu chủ đề không phù hợp với môi trường học đường (NSFW, bạo lực, nội dung 18+, chất cấm), hãy trả về [] ngay lập tức.',
    messages: [{
      role: 'user',
      content: `Tạo ${count} câu hỏi trắc nghiệm về "${topic}" theo format sau:
[
  {
    "question": "Câu hỏi ở đây?",
    "options": ["A) Lựa chọn 1","B) Lựa chọn 2","C) Lựa chọn 3","D) Lựa chọn 4"],
    "answer": "A",
    "explanation": "Giải thích tại sao đáp án đúng"
  }
]
Yêu cầu: câu hỏi bằng tiếng Việt, đa dạng độ khó, đáp án phải chính xác.`
    }],
  });

  const text = resp.content[0].type === 'text' ? resp.content[0].text : '[]';
  try {
    const clean = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// ── Summarize Chat ─────────────────────────────────────────────────
export async function summarizeMessages(messages: string[]): Promise<string> {
  const combined = messages.reverse().join('\n');
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Hãy tóm tắt ngắn gọn cuộc trò chuyện Discord sau đây bằng tiếng Việt. 
Liệt kê các chủ đề chính và điểm nổi bật. Format đẹp với bullet points:

${combined.slice(0, 6000)}`
    }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể tóm tắt';
}

// ── Translation ────────────────────────────────────────────────────
export async function translateText(text: string, targetLang: string): Promise<string> {
  const langMap: Record<string, string> = {
    'vi': 'tiếng Việt',
    'en': 'tiếng Anh',
    'ja': 'tiếng Nhật',
    'zh': 'tiếng Trung',
    'ko': 'tiếng Hàn',
    'fr': 'tiếng Pháp',
    'de': 'tiếng Đức',
  };
  const targetName = langMap[targetLang] || targetLang;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Dịch đoạn văn sau sang ${targetName}. Chỉ trả về bản dịch, không giải thích thêm:\n\n${text}`
    }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể dịch';
}

// ── Write Announcement ─────────────────────────────────────────────
export async function writeAnnouncement(topic: string, style: string): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: 'Bạn là trợ lý viết thông báo cho server Discord. Viết bằng tiếng Việt, dùng emoji phù hợp, rõ ràng và chuyên nghiệp.',
    messages: [{
      role: 'user',
      content: `Viết thông báo về: "${topic}"\nPhong cách: ${style}\nĐộ dài: khoảng 5-8 dòng`
    }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể tạo thông báo';
}

// ── Spell Check ────────────────────────────────────────────────────
export async function spellCheck(text: string): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Kiểm tra và sửa lỗi chính tả/ngữ pháp cho đoạn văn sau (tiếng Việt hoặc tiếng Anh).
Trả về theo format:
**Bản gốc:**
[text gốc]

**Đã sửa:**
[text đã sửa]

**Các lỗi đã sửa:**
- [liệt kê các lỗi]

Đoạn văn: ${text}`
    }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể kiểm tra';
}

// ── Write Caption ──────────────────────────────────────────────────
export async function writeCaption(topic: string, platform: string): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: 'Bạn là copywriter sáng tạo, viết caption hay và hấp dẫn cho mạng xã hội.',
    messages: [{
      role: 'user',
      content: `Viết 3 phiên bản caption cho ${platform} về chủ đề: "${topic}"\nMỗi caption có hashtag phù hợp.`
    }],
  });
  return resp.content[0].type === 'text' ? resp.content[0].text : '❌ Không thể tạo caption';
}