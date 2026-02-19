const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
require('dotenv').config();
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);
const crypto = require("crypto");
const { ORDER_FLOW } = require('./constants/order_flow');
const port = process.env.PORT || 3000;
var admin = require("firebase-admin");

let serviceAccount;
try {
    if (!process.env.FB_SERVICE_KEY) {
        throw new Error('FB_SERVICE_KEY environment variable is not set');
    }

    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');

    // Log first few characters to verify (remove in production)
    // console.log('Decoded string preview:', decoded.substring(0, 50));

    serviceAccount = JSON.parse(decoded);
    console.log('Firebase service account loaded successfully');
} catch (error) {
    console.error('Failed to parse Firebase service account:', error.message);
    console.error('Full error:', error);
    process.exit(1); // Exit gracefully instead of crashing
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const generateTrackingId = () => {
    const prefix = "ORDR";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `${prefix}-${date}-${random}`;
}

// middlewire
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
    // console.log(req.headers.authorization);
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        // console.log('after decoded', decoded)
        req.decoded_email = decoded.email;
        next()
    } catch (err) {
        res.status(401).send({ message: 'unauthorized error' });
    }
}

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
    // await client.db("admin").command({ ping: 1 });
    // console.log("MongoDB Ping Success — Connected to cluster!");

    const db = client.db('order_loom');
    productsCollection = db.collection('products');
    ordersCollection = db.collection('orders');
    trackingsCollection = db.collection('trackings');
    // contributionCollection = db.collection('contribution');
    usersCollection = db.collection('users');
    // console.log('MongoDB connected (reused on next calls)');
    return { productsCollection, usersCollection, ordersCollection, trackingsCollection };
}

getCollections().catch(console.error);

// middleware with database access
const verifyAdmin = async (req, res, next) => {
    const { usersCollection } = await getCollections();
    const email = req.decoded_email;
    const query = { email };
    const user = await usersCollection.findOne(query);
    if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}


const verifyManager = async (req, res, next) => {
    const { usersCollection } = await getCollections();
    const email = req.decoded_email;
    const query = { email };
    const user = await usersCollection.findOne(query);
    if (!user || user.role !== 'manager') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}

const verifyBuyer = async (req, res, next) => {
    const { usersCollection } = await getCollections();
    const email = req.decoded_email;
    const query = { email };
    const user = await usersCollection.findOne(query);
    if (!user || user.role !== 'buyer') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}

// Order Flow realted API 
app.get('/order-flow',verifyFBToken,verifyManager, (req, res) => {
    res.send(ORDER_FLOW);
});

// Tracking realted API
app.get('/trackings/:trackignId/log',verifyFBToken, async (req, res) => {
    const { trackingsCollection } = await getCollections();
    const trackingId = req.params.trackignId;
    console.log(trackingId)
    const query = { trackingId };
    const cursor = trackingsCollection.find(query);
    const result = await cursor.toArray();
    console.log(result)
    res.send(result)
})

// user related APIs
app.post('/users', async (req, res) => {
    const { usersCollection } = await getCollections();
    const user = req.body;
    user.createdAt = new Date();
    const email = user.email;
    user.adminApproval = "not checked";
    console.log(email);
    const userExist = await usersCollection.findOne({ email })

    if (userExist) {
        return res.send({ message: 'user exists' })
    }
    const result = await usersCollection.insertOne(user);
    res.send(result)
})

app.get('/users',verifyFBToken,verifyAdmin, async (req, res) => {
    const { usersCollection } = await getCollections();
    const cursor = usersCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})

app.patch('/users/:id',verifyFBToken,verifyAdmin, async (req, res) => {
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
app.get('/user/:email/role',verifyFBToken, async (req, res) => {
    const { usersCollection } = await getCollections();
    const email = req.params.email;
    // console.log(email);
    const query = { email };
    const user = await usersCollection.findOne(query);
    res.send({ role: user?.role });
})

app.get('/user/byEmail',verifyFBToken, async (req, res) => {
    const { usersCollection } = await getCollections();
    const email = req.query.email;
    console.log(email)
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send(result)
})

// Product related APIs

app.get('/latest-products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const query = { showOnHome: true }
    const cursor = productsCollection.find(query).sort({ createdAt: -1 }).limit(6);
    const result = await cursor.toArray();
    res.send(result);
})

app.get('/products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.find().toArray();
    res.send(result);
})

app.get('/allproducts/byEmail', verifyFBToken, verifyManager, async (req, res) => {
    const { productsCollection } = await getCollections();
    const email = req.query.email;
    const query = { createdByUserEmail: email };
    // console.log('hello')
    const result = await productsCollection.find(query).toArray();
    res.send(result)
})

app.get('/products/byEmail', verifyFBToken, async (req, res) => {
    const { productsCollection } = await getCollections();
    const email = req.query.email;
    const query = { createdByUserEmail: email };
    const result = await productsCollection.findOne(query);
    res.send(result)
})


app.get('/products/:id',verifyFBToken,  async (req, res) => {
    const { productsCollection } = await getCollections();
    const id = req.params.id;
    console.log(id, 'paisi')
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.findOne(query);
    res.send(result)
})

app.post('/products', verifyFBToken, verifyManager, async (req, res) => {
    const { productsCollection } = await getCollections();
    //   console.log(req.headers)
    console.log(req.body)
    const { data: newProduct, adminApproval } = req.body;
    if (adminApproval !== 'approved') {
        return res.status(403).send({
            message: `Your account status is ${adminApproval}`
        })
    }
    newProduct.createdAt = new Date();
    const email = newProduct.createdByUserEmail;
    const query = { createdByUserEmail: email }
    const duplicate = await productsCollection.findOne(query);
    if (duplicate) {
        return res.status(409).send({ message: 'You have already added a product' })
    }
    const result = await productsCollection.insertOne(newProduct);
    res.send(result)
})

app.patch('/products', verifyFBToken, async (req, res) => {
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

app.delete('/products/:id', verifyFBToken, async (req, res) => {
    const { productsCollection } = await getCollections();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.deleteOne(query);
    res.send(result)
})

app.patch('/products/:id/toggle', verifyFBToken, verifyAdmin, async (req, res) => {
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
app.get('/orders/byEmail', verifyFBToken, async (req, res) => {
    const { ordersCollection } = await getCollections();
    const email = req.query.email;
    const query = { email };
    const result = await ordersCollection.find(query).toArray();
    res.send(result)
})

app.get('/orders/:id',verifyFBToken, async (req, res) => {
    const { ordersCollection } = await getCollections();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await ordersCollection.findOne(query);
    res.send(result)
})

app.get('/orders/by-product/:productId',verifyFBToken,verifyManager, async (req, res) => {
    const { ordersCollection } = await getCollections();
    const status = req.query.status;
    const productId = req.params.productId;
    const query = { productId };
    if (status === 'pending') {
        query.status = 'pending'
    }
    else {
        query.status = { $nin: ['pending', 'completed'] };
    }
    const cursor = ordersCollection.find(query);
    const result = await cursor.toArray();
    res.send(result)
})

app.get('/orders', verifyFBToken, verifyAdmin, async (req, res) => {
    const { ordersCollection } = await getCollections();
    console.log('order')
    const cursor = ordersCollection.find();
    const result = await cursor.toArray();
    res.send(result)
})



app.post('/orders',verifyFBToken,verifyBuyer, async (req, res) => {
    const { ordersCollection } = await getCollections();
    const { paymentInfo, adminApproval } = req.body;
    console.log(paymentInfo, adminApproval)
    if (adminApproval !== 'approved') {
        return res.status(403).send({
            message: `Your account status is ${adminApproval}`
        })
    }
    const status = 'pending';
    paymentInfo.status = status;
    const loggedAt = new Date();
    paymentInfo.placedAt = loggedAt;
    const trackingId = generateTrackingId();
    paymentInfo.trackingId = trackingId;
    const trackingInfo = { trackingId, status, loggedAt };
    const { productId, email } = paymentInfo;
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
    const trackingResult = await trackingsCollection.insertOne(trackingInfo)
    const result = await ordersCollection.insertOne(paymentInfo);
    res.send(result,trackingResult)
})

app.patch('/orders/:id',verifyFBToken, async (req, res) => {
    const { ordersCollection, trackingsCollection } = await getCollections();
    console.log(req.body);
    const id = req.params.id;
    const adminApproval = req.body.adminApproval;
    console.log(adminApproval)
    if (adminApproval !== 'approved') {
        return res.status(403).send({
            message: `Your account status is ${adminApproval}`
        })
    }
    const status = req.body.status;
    const location = req.body.location;
    const note = req.body.note;
    const trackingId = req.body.trackingId;
    const loggedAt = new Date();
    let newTrackingsInfo = {};
    if (status === 'approved') {
        newTrackingsInfo = { trackingId, status, loggedAt };
    }
    else {
        newTrackingsInfo = { trackingId, status, loggedAt, location, note };
    }
    const trackingsResult = await trackingsCollection.insertOne(newTrackingsInfo);

    const query = { _id: new ObjectId(id) };
    let updateStatus = {};
    if (status === 'approved') {
        updateStatus = {
            $set: {
                status: status,
                approvedAt: new Date()
            }
        };
    }
    else {
        updateStatus = {
            $set: {
                status: status
            }
        }
    }

    const result = await ordersCollection.updateOne(query, updateStatus);
    res.send(result, trackingsResult)
})

app.delete('/orders/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await ordersCollection.deleteOne(query);
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

// app.listen(port, () => {
//     console.log(`Example app listening on port ${port}`)
// })

module.exports = app;