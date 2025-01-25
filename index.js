require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vqld2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // ------------------db collection---------------------------
    const database = client.db("PairUp");
    const usersCollection = database.collection("users");
    const biodataCollection = database.collection("biodata");
    const favoriteBiodataCollection = database.collection("favorites");
    const contactRequestCollection = database.collection("contactRequest");
    const successStroyCollection = database.collection("successStroyes");





    // ----------------------------------- payment stripe relatedd apis -------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const ammount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: ammount,
        currency: "usd",
        payment_method_types: ["card"],
      });


      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

// ----------------------------------- payment stripe relatedd apis end -------------------------------------








    // -------------------------------jwt token section start----------------------------------------------

    // payment inntentl
    // create jwt token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // jwt authorization token middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        function (err, decoded) {
          if (err) {
            return res.status(401).send({ message: "forbidden access" });
          }
          req.decoded = decoded;
          next();
        }
      );
    };

    // ---------------------------jwt token section end-------------------------------------------------









    // ------------------------------user section start------------------------------------------------------

    // save user in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const match = await usersCollection.findOne(query);
      if (match) {
        return res.send({ message: "user exist" });
      }
      user.role = "user";
      user.status = "normal";
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // save biodata in db
    app.post("/biodata", async (req, res) => {
      const data = req.body;
      const email = data.email;
      const query = { email: email };
      const exist = await biodataCollection.findOne(query);
      if (exist) {
        const updateDoc = {
          $set: {
            ...data,
          },
        };
        const result = await biodataCollection.updateOne(query, updateDoc);
        return res.send(result);
      }
      const BiodataId = (await biodataCollection.estimatedDocumentCount()) + 1;
      const doc = {
        BiodataId,
        ...data,
        status: "normal",
      };
      const result = await biodataCollection.insertOne(doc);
      res.send(result);
    });

    // get all biodatas
    app.get("/biodatas", async (req, res) => {
      const gender = req.query.gender;
      const location = req.query.location;
      const fromAge = req.query.fromAge;
      const toAge = req.query.toAge;
      const query = {};
      if (gender) {
        query.biodataType = gender;
      }
      if (location) {
        query.permanentDivision = location;
      }
      if (fromAge && toAge) {
        query.age = {
          $gte: parseInt(fromAge, 10),
          $lte: parseInt(toAge, 10),
        };
      }
      // console.log(query)
      const result = await biodataCollection.find(query).toArray();
      res.send(result);
    });

    // get single biodata
    app.get("/biodataDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    // get single biodata by email user
    app.get("/selfBiodata/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    // apply for biodata for premium
    app.patch("/applyBiodataPremium/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      // const biodata = await biodataCollection.findOne(query);
      // const user = await usersCollection.findOne(query);
      // if (biodata?.status === "pending") {
      //   return res.send({ message: "you allready applied" });
      // }
      // if (user?.status === "pending") {
      //   return res.send({ message: "you allready applied" });
      // }
      const updateDoc = {
        $set: {
          status: "pending",
        },
      };
      const updateUser = await usersCollection.updateOne(query, updateDoc);
      const result = await biodataCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // add favorite biodata
    app.post("/saveFavoriteBiodata", verifyToken, async (req, res) => {
      const data = req.body;
      const { ownerEmail, BiodataId } = data;
      const query = { ownerEmail, BiodataId };
      const match = await favoriteBiodataCollection.findOne(query);
      if (match) {
        return res.send({ message: "you already add this" });
      }
      const result = await favoriteBiodataCollection.insertOne(data);

      res.send(result);
    });

    // get favorites list
    app.get("/favoritesList/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { ownerEmail: email };
      const result = await favoriteBiodataCollection.find(query).toArray();
      res.send(result);
    });

    // delete favorites list
    app.delete("/favoritesList/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { ownerEmail: email };
      const result = await favoriteBiodataCollection.deleteOne(query);
      res.send(result);
    });

    // cheack if the user is premium
    app.get("/selfUser/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });


    // post contact request
    app.post('/contact-request',async(req,res)=>{
      const payment = req.body;
      const {email,biodataId} = payment;
      const query = {email,biodataId};
      const match = await contactRequestCollection.findOne(query);
      if(match){
        console.log('you already add this');
        return res.send({ message: "you already add this" });
      }
      const result = contactRequestCollection.insertOne(payment);
      console.log('payment info',payment);
      res.send(result);
    });

    // get contact request user 
    app.get('/contactRequest/:email',async(req,res)=>{
      const email = req.params.email;
      const query = {email:email}
      const result = await contactRequestCollection.find(query).toArray();
      res.send(result);
    });

    // delete contact request
    app.delete('/delContactRequest/:id',async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await contactRequestCollection.deleteOne(query);
      res.send(result);
    });


    // get premium biodata
    app.get('/getPremiumBiodata',async(req,res)=>{
      const query = {status:'premium'};
      const result  = await biodataCollection.find(query).toArray();
      res.send(result);
    });

    // save success marrige story

    app.post('/successStory',verifyToken,async(req,res)=>{
      const data = req.body;
      const email = data.selfEmail;
      const query = {selfEmail:email};
      const match = await successStroyCollection.findOne(query);
      if(match){
        return res.send({message:'you already add this'});
      }
      const result = await successStroyCollection.insertOne(data);
      res.send(result);
    });













    // --------------------------------------- admin section -----------------------------------------

    // cheack isAdmin
    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user) {
        isAdmin = user?.role === "admin";
      }
      res.send({ isAdmin });
    });

    // get admin stats
    app.get("/admin-stats", async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const Malequery = { biodataType: "Male" };
      const Femalequery = { biodataType: "Female" };
      const premiumQuery = {status:'premium'};
      const maleBiodataCount = await biodataCollection.countDocuments(
        Malequery
      );
      const femaleBiodataCount = await biodataCollection.countDocuments(
        Femalequery
      );
      const permiumBiodataCount = await biodataCollection.countDocuments(premiumQuery);
      const revenue = await contactRequestCollection.countDocuments() * 5; 

      res.send({ users, maleBiodataCount, femaleBiodataCount,permiumBiodataCount,revenue });
    });

    // get all users
    app.get("/allUsers/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // make admin
    app.patch("/makeAdmin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const user = await usersCollection.updateOne(query, updateDoc);
      res.send(user);
    });

    // make user premium
    app.patch("/makePremium/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updateDoc = {
        $set: {
          status: "premium",
        },
      };
      const user = await usersCollection.updateOne(query, updateDoc);
      res.send(user);
    });

    // make Biodata premium
    app.patch("/makeBiodataPremium/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updateDoc = {
        $set: {
          status: "premium",
        },
      };
      const user = await biodataCollection.updateOne(query, updateDoc);
      res.send(user);
    });

    // get those biodata who applied for permium
    app.get("/get-applied-biodata", verifyToken, async (req, res) => {
      const query = { status: "pending" };
      const result = await biodataCollection.find(query).toArray();
      res.send(result);
    });


    // get contact request
    app.get('/getContactRequestAdmin',async(req,res)=>{
      const result = await contactRequestCollection.find().toArray();
      res.send(result);
    });

    // approve contact request 
    app.patch('/approveContactRequestAdmin/:id',async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await contactRequestCollection.updateOne(query,updateDoc);
      res.send(result);
    });

  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
