const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
require('dotenv').config();
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);
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
let productsCollection, usersCollection, ordersCollection, trackingsCollection;

async function getCollections() {
    if (productsCollection) return { productsCollection, usersCollection, ordersCollection, trackingsCollection };

    await client.connect();

    //  Ping the admin DB to make sure connection is successful
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Ping Success — Connected to cluster!");

    const db = client.db('order_loom');
    productsCollection = db.collection('products');
    ordersCollection = db.collection('orders');
    trackingsCollection = db.collection('trackings');
    // contributionCollection = db.collection('contribution');
    usersCollection = db.collection('users');
    console.log('MongoDB connected (reused on next calls)');
    return { productsCollection, usersCollection, ordersCollection, trackingsCollection };
}

getCollections().catch(console.error);


// user related APIs
app.post('/users', async (req, res) => {
    const { usersCollection } = await getCollections();
    const user = req.body;
    user.createdAt = new Date();
    const email = user.email;
    console.log(email);
    const userExist = await usersCollection.findOne({ email })

    if (userExist) {
        return res.send({ message: 'user exists' })
    }
    const result = await usersCollection.insertOne(user);
    res.send(result)
})

app.get('/users', async (req, res) => {
    const { usersCollection } = await getCollections();
    const cursor = usersCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})

app.patch('/users/:id', async (req, res) => {
    const { usersCollection } = await getCollections();
    const id = req.params.id;
    const { status } = req.body;
    console.log(status)
    const query = { _id: new ObjectId(id) };
    const update = {
        $set: {
            adminApproval: status
        }
    };
    const result = await usersCollection.updateOne(query, update);
    res.send(result)
})

// Product related APIs

app.get('/latest-products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const cursor = productsCollection.find().sort({ date: -1 }).limit(6);
    const result = await cursor.toArray();
    res.send(result);
})

app.get('/products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const cursor = productsCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})

app.get('/products/:email/byEmail', async (req, res) => {
    const { productsCollection } = await getCollections();
    const email = req.params.email;
    console.log(email)
    const query = { createdByUserEmail: email };
    const cursor = productsCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
})

app.get('/products/:id', async (req, res) => {
    const { productsCollection } = await getCollections();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.findOne(query);
    res.send(result)
})

app.post('/products', async (req, res) => {
    const { productsCollection } = await getCollections();
    //   console.log(req.headers)
    const newProduct = req.body;
    newProduct.createdAt = new Date();
    const result = await productsCollection.insertOne(newProduct);
    res.send(result)
})

app.patch('/products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const newProduct = req.body;

    const { _id, ...updateFields } = newProduct;

    const query = { _id: new ObjectId(_id) };
    console.log(updateFields)

    const result = await productsCollection.updateOne(
        query,
        { $set: updateFields }
    );

    if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Product not found" });
    }

    res.send(result)
})

app.delete('/products/:id', async (req, res) => {
    const { productsCollection } = await getCollections();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.deleteOne(query);
    res.send(result)
})

app.patch('/products/:id/toggle', async (req, res) => {
    const { productsCollection } = await getCollections();
    const id = req.params.id;
    const { toggle } = req.body;
    const query = { _id: new ObjectId(id) };
    const update = {
        $set: {
            showOnHome: toggle
        }
    };
    const result = await productsCollection.updateOne(query, update);
    res.send(result)
})

// Order related APIs 
app.get('/orders/:email/byEmail', async (req, res) => {
    const { ordersCollection } = await getCollections();
    const email = req.params.email;
    const status = req.query.status
    console.log(email)
    const query = { email, status };
    const cursor = ordersCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
})

app.post('/orders', async (req, res) => {
    const { ordersCollection } = await getCollections();
    const orderInfo = req.body;
    orderInfo.status = 'pending';
    orderInfo.createdAt = new Date();
    const { productId, email, status } = orderInfo;
    const duplicate = await ordersCollection.findOne({
        productId,
        email,
        status: { $in: ['pending'] }
    });

    if (duplicate) {
        return res.status(409).send({
            message: 'You already ordered this item'
        });
    }
    const result = await ordersCollection.insertOne(orderInfo);
    res.send(result)
})

app.patch('/orders/:id', async (req, res) => {
    const { ordersCollection } = await getCollections();
    const id = req.params.id;
    const status = req.body.status;
    console.log(req.body, status)
    const query = { _id: new ObjectId(id) };
    const updateStatus = {
        $set: {
            status: status
        }
    };
    const result = await ordersCollection.updateOne(query, updateStatus);
    res.send(result)
})

app.get('/orders', async (req, res) => {
    const { ordersCollection } = await getCollections();
    const status = req.params.status;
    console.log(status);
    const cursor = ordersCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})

app.get('/orders/:id', async (req, res) => {
    const { ordersCollection } = await getCollections();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await ordersCollection.findOne(query);
    res.send(result)
})

// Payment related APIs
app.post("/create-checkout-session", async (req, res) => {
    const { productTitle, quantity, unitPrice } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: productTitle,
                        },
                        unit_amount: Math.round(unitPrice * 100), // cents
                    },
                    quantity,
                },
            ],
            success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
        });

        res.send({ url: session.url });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
