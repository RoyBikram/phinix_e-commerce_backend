const cors = require("cors");
const express = require("express");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
var admin = require("firebase-admin");
// Secure connection to firebase
var serviceAccount = require("./permission.json");
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const app = express();



//middleware
// app.use(express.json());
app.use(
    cors({
        origin: "http://localhost:3000",
    })
);
// app.use(bodyParser.urlencoded({ extended: false }));

const FirebaseApp = !admin.apps.length
    ? admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
      })
    : admin.app();
const db = getFirestore();
const endPointSecret = process.env.STRIPE_SECRET_KEY;

// Establish connection to Stripe

const FulfillOrder = async (session,OrderRef) => {
    // console.log(session);
    await OrderRef.collection("Products").doc(session.productUid).set(session)
};

const RemoveOrderFromCard = async (UserUid, ProductUid) => {
    const Ref = db.doc(`Users/${UserUid}/CardProducts/${ProductUid}`);
    const Snap = await Ref.get();
    if (Snap.exists) {
        Ref.delete()
    }
}

// TODO: Fetch these data from database
const ProductPriceData = {
    "0AVbcjnQ1hxttKiy83rn": {
        currentPrice: 149,
        originalPrice: 200
    },
    "96VJ7n1H3nwG9eoWMNud":  {
        currentPrice: 199,
        originalPrice: 249
    },
    "AEmDYHELlbjQRUs0ajuY":  {
        currentPrice: 349,
        originalPrice: 450
    },
    "CwPZLa2PfMLEvy0kNTfZ":  {
        currentPrice: 199,
        originalPrice: 250
    },
    "Knv83o65oaeOb8WpnRys":  {
        currentPrice: 40,
        originalPrice: 70
    },
    "P1nhFHN2U4SfkZwVCIBU": {
        currentPrice: 15,
        originalPrice: 25
    },
    "Zhc0NUpzonWj0QsO9i36": {
        currentPrice: 20,
        originalPrice: 35
    },
    "leParWNtizHZos9kJpE3":  {
        currentPrice: 50,
        originalPrice: 70
    },
    "s7FzAJPcA6lJI6nsFHMg":  {
        currentPrice: 349,
        originalPrice: 450
    },
};

let UserAddress = null;









app.post("/create-checkout-session", bodyParser.json(), async (req, res) => {
    // console.log(req.body)
    UserAddress = req.body.UserAddress
    try {
        const session = await stripe.checkout.sessions.create({
            client_reference_id: req.body.UserUid,
            payment_method_types: ["card"],
            mode: "payment",
            line_items: req.body.Products.map((product) => {
                return {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": product.name,
                            "images": [product.image],
                            "metadata": {
                                "quantity":product.quantity,
                                "uid": product.productId,
                                "rating": product.rating,
                                // "price": {
                                // }
                                "currentPrice":ProductPriceData[product.productId].currentPrice,
                                "originalPrice":ProductPriceData[product.productId].originalPrice
                            },
                        },
                        "unit_amount": ProductPriceData[product.productId].currentPrice * 100,
                    },
                    "quantity": product.quantity,
                };
            }),
            "success_url": "http://localhost:3000/confirm_order",
            "cancel_url": "http://localhost:3000/order_summary",
        });
        res.status(200).json({ id: session.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post(
    "/webhook",
    bodyParser.raw({ type: "application/json" }),
    async (req, res) => {
        const event = JSON.parse(req.body)
        let CheckoutSessions = null;
        // console.log(event)
        console.log(event.type)
        if (event.type == "checkout.session.completed") {
            TotalAmount = Number(event.data.object.amount_total)/100
            console.log(event.data.object.amount_total)
            CheckoutSessions = await  stripe.checkout.sessions.retrieve(event.data.object.id)
            const dataApi = await stripe.checkout.sessions.listLineItems(event.data.object.id)
            const UserUid = CheckoutSessions.client_reference_id
            // const UserAddress = CheckoutSessions.metadata.UserAddress
            const FilletedProductsArray = []
            let OrderRef = null;
            db.collection(`Orders`).add({
            // db.collection(`Users/${UserUid}/Order`).add({
                address: UserAddress,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                total_amount: TotalAmount
            }).then((docRef) => {
                OrderRef = docRef
                dataApi.data.forEach(async (each) => {
                    
                    let ProductData = await stripe.products.retrieve(each.price.product)
                    const FilletedProductObj = {
                        productUid: ProductData.metadata.uid,
                        image: ProductData.images[0],
                        quantity: Number(ProductData.metadata.quantity),
                        rating: Number(ProductData.metadata.rating),
                        name: ProductData.name,
                        price: {
                            currentPrice: Number(ProductData.metadata.currentPrice),
                            originalPrice: Number(ProductData.metadata.originalPrice)
                        }
                    }
                    FulfillOrder(FilletedProductObj, OrderRef)
                    RemoveOrderFromCard(UserUid,FilletedProductObj.productUid)
                })
                // added
                db.collection(`Users/${UserUid}/Order`).add({
                    id:OrderRef.id
                })
            // added
            })
            

            // console.log(UserUid)
            
        }
        res.json({ received: true });
    }
);

app.listen(8000, () => console.log(`Listening on port!`));
