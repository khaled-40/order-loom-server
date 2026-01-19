const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
require('dotenv').config();
const port = process.env.PORT || 3000;

// middlewire
app.use(cors());
app.use(express.json());

// mongodb connection 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uk3n3pp.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// These will be set on first request
let productsCollection, usersCollection;

async function getCollections() {
    if (productsCollection) return { productsCollection, usersCollection };

    await client.connect();

    //  Ping the admin DB to make sure connection is successful
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Ping Success — Connected to cluster!");

    const db = client.db('order_loom');
    productsCollection = db.collection('products');
    // contributionCollection = db.collection('contribution');
    usersCollection = db.collection('users');
    console.log('MongoDB connected (reused on next calls)');
    return { productsCollection, usersCollection };
}

getCollections().catch(console.error);

app.get('/latest-products', async (req, res) => {
  const { productsCollection } = await getCollections();
  const cursor = productsCollection.find().sort({ date: -1 }).limit(6);
  const result = await cursor.toArray();
  res.send(result);
})

app.get('/products', async(req,res) => {
    const {productsCollection} = await getCollections();
    const cursor = productsCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})

app.get('/products/:id', async(req,res) => {
    const {productsCollection} = await getCollections();
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await productsCollection.findOne(query);
    res.send(result)
})

app.post('/products', async (req, res) => {
  const { productsCollection } = await getCollections();
//   console.log(req.headers)
  const newProduct = req.body;
  const result = await productsCollection.insertOne(newProduct);
  res.send(result)
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
