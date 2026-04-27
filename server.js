const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());

// 정적 파일 제공 (현재 디렉토리를 루트로)
app.use(express.static(path.join(__dirname)));

// 노드/엣지 추가 API 엔드포인트
app.post('/api/add-elements', (req, res) => {
    const { src, elements } = req.body;
    
    if (!elements || !Array.isArray(elements)) {
        return res.status(400).json({ error: 'Invalid elements data' });
    }

    // 대상 JSON 파일 경로 결정 (기본값: data.json)
    const filename = src ? `${src}.json` : 'data.json';
    const filePath = path.join(__dirname, 'data', filename);

    // 파일 읽기
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Failed to read data file' });
        }

        try {
            // 기존 데이터 파싱
            const currentData = JSON.parse(data);
            
            // 새 데이터 추가
            const updatedData = currentData.concat(elements);

            // 파일에 다시 쓰기 (들여쓰기 2칸으로 예쁘게 포맷팅)
            fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf8', (writeErr) => {
                if (writeErr) {
                    console.error('Error writing file:', writeErr);
                    return res.status(500).json({ error: 'Failed to save data' });
                }
                
                res.json({ success: true, message: 'Elements successfully added and saved to ' + filename });
            });
        } catch (parseErr) {
            console.error('Error parsing JSON:', parseErr);
            res.status(500).json({ error: 'Invalid JSON format in data file' });
        }
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`\n🚀 Seomal Server is running!`);
    console.log(`👉 Open your browser and visit: http://localhost:${PORT}\n`);
});
