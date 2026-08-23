import mongoose from "mongoose";

/* The old site had nowhere to record an order: money moved through Razorpay and
   a parcel appeared in Shiprocket, but nothing tied the two together. If the
   customer closed the tab mid-payment the sale simply vanished from view. Every
   order now lands here the moment it is created, and is updated as it is paid
   and shipped. */

const lineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Name and price are COPIES taken at purchase time. If the catalogue price
    // changes next week, this order must still show what was actually charged.
    name:    { type: String, required: true },
    price:   { type: Number, required: true },
    variant: { type: String, default: "" },
    qty:     { type: Number, required: true, min: 1 },
    sku:     { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },

    razorpayOrderId:   { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },

    status: {
      type: String,
      enum: ["created", "paid", "failed", "shipped", "cancelled"],
      default: "created",
      index: true,
    },

    items: { type: [lineSchema], required: true },

    // What was actually charged, in whole rupees.
    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      total:    { type: Number, required: true },
      promo:    { type: String, default: "" },
    },

    customer: {
      name:    { type: String, default: "" },
      email:   { type: String, default: "" },
      phone:   { type: String, default: "" },
      address: { type: String, default: "" },
      city:    { type: String, default: "" },
      state:   { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    shipping: {
      shiprocketOrderId: { type: String, default: null },
      shipmentId:        { type: String, default: null },
      awb:               { type: String, default: null, index: true },
      courier:           { type: String, default: null },
      // True when payment succeeded but the courier booking did not. These are
      // the orders a human needs to look at.
      pending:           { type: Boolean, default: false },
    },

    paidAt: { type: Date, default: null },
    notes:  { type: String, default: "" },
  },
  { timestamps: true }
);

/* Safe to hand back to the browser after checkout — no internal SKUs. */
orderSchema.methods.toPublic = function () {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    items: this.items.map((l) => ({ name: l.name, variant: l.variant, qty: l.qty, price: l.price })),
    pricing: this.pricing,
    awb: this.shipping.awb,
    courier: this.shipping.courier,
    shipmentPending: this.shipping.pending,
    paidAt: this.paidAt,
  };
};

export default mongoose.model("Order", orderSchema);
