const express = require('express');
const path    = require('path');
const cors    = require('cors');
const { PrismaClient } = require('@prisma/client');

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Graphs ──────────────────────────────────────────────────────────────────

app.get('/api/graphs', async (req, res) => {
    const graphs = await prisma.graph.findMany({
        include: { _count: { select: { nodes: true } } },
        orderBy: { createdAt: 'asc' }
    });
    res.json(graphs.map(g => ({ id: g.id, name: g.name, nodeCount: g._count.nodes })));
});

app.post('/api/graphs', async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const graph = await prisma.graph.create({ data: { name: name.trim() } });
    res.json({ id: graph.id, name: graph.name, nodeCount: 0 });
});

app.patch('/api/graphs/:id', async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const graph = await prisma.graph.update({
        where: { id: parseInt(req.params.id) },
        data:  { name: name.trim() }
    });
    res.json({ id: graph.id, name: graph.name });
});

app.delete('/api/graphs/:id', async (req, res) => {
    await prisma.graph.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
});

// ─── Elements ────────────────────────────────────────────────────────────────

app.get('/api/graphs/:id/elements', async (req, res) => {
    const graphId = parseInt(req.params.id);
    const [nodes, edges] = await Promise.all([
        prisma.node.findMany({ where: { graphId } }),
        prisma.edge.findMany({ where: { graphId } })
    ]);
    res.json([
        ...nodes.map(n => ({
            group: 'nodes',
            data: { id: n.key, label: n.label, url: n.url, content: n.content }
        })),
        ...edges.map(e => ({
            group: 'edges',
            data: { id: `${e.source}-${e.target}`, source: e.source, target: e.target }
        }))
    ]);
});

app.post('/api/graphs/:id/elements', async (req, res) => {
    const graphId  = parseInt(req.params.id);
    const { elements } = req.body;
    if (!Array.isArray(elements)) return res.status(400).json({ error: 'Invalid elements' });

    for (const el of elements) {
        if (el.group === 'nodes') {
            await prisma.node.upsert({
                where:  { graphId_key: { graphId, key: el.data.id } },
                create: { key: el.data.id, label: el.data.label || el.data.id, url: el.data.url || '', content: '', graphId },
                update: {}
            });
        } else if (el.group === 'edges') {
            await prisma.edge.upsert({
                where:  { graphId_source_target: { graphId, source: el.data.source, target: el.data.target } },
                create: { source: el.data.source, target: el.data.target, graphId },
                update: {}
            });
        }
    }
    res.json({ ok: true });
});

// ─── Node content ─────────────────────────────────────────────────────────────

app.patch('/api/nodes/:graphId/:key/content', async (req, res) => {
    const graphId = parseInt(req.params.graphId);
    const { content } = req.body;
    await prisma.node.update({
        where:  { graphId_key: { graphId, key: req.params.key } },
        data:   { content: content ?? '' }
    });
    res.json({ ok: true });
});

// ─── Server ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n🚀 Seomal Server is running!`);
    console.log(`👉 Open your browser and visit: http://localhost:${PORT}\n`);
});
