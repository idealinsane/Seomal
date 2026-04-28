const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const dataPath = path.join(__dirname, '../data/data.json');
    const elements = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // source/target 유무로 노드/엣지 구분 (group 필드 없는 Cytoscape 형식)
    const nodes = elements.filter(e => !e.data?.source);
    const edges = elements.filter(e =>  e.data?.source);

    const graph = await prisma.graph.create({ data: { name: '기본 그래프' } });
    console.log(`그래프 생성: "${graph.name}" (id: ${graph.id})`);

    for (const node of nodes) {
        await prisma.node.create({
            data: {
                key:     node.data.id,
                label:   node.data.label || node.data.id,
                url:     node.data.url   || '',
                content: '',
                graphId: graph.id
            }
        });
    }
    console.log(`노드 ${nodes.length}개 완료`);

    let edgeCount = 0;
    for (const edge of edges) {
        try {
            await prisma.edge.create({
                data: { source: edge.data.source, target: edge.data.target, graphId: graph.id }
            });
            edgeCount++;
        } catch (_) { /* 중복 무시 */ }
    }
    console.log(`엣지 ${edgeCount}개 완료`);
    console.log('마이그레이션 완료!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
