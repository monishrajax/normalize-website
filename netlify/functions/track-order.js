/* GET /.netlify/functions/track-order?awb=XXXXXXXX
   (or ?order_id=NRM-... to look up by our own order number)

   Proxies Shiprocket's Track Order API and returns a small, normalised shape
   the front end can render. Shiprocket credentials stay on the server.
*/
const { reply, shiprocket } = require("./_lib");

function normalise(payload){
  // Shiprocket nests differently for AWB vs order_id lookups, so dig for
  // whichever shape came back.
  const box = payload && (payload.tracking_data || payload);
  const track = box && (box.shipment_track || [])[0];
  const activities = (box && box.shipment_track_activities) || [];

  return {
    awb: track && track.awb_code ? String(track.awb_code) : null,
    courier: (track && track.courier_name) || null,
    status: (track && track.current_status) || (box && box.shipment_status) || "In transit",
    etd: (track && track.edd) || null,
    scans: activities.slice(0, 25).map(a => ({
      activity: a.activity || a["sr-status-label"] || "",
      location: a.location || "",
      date: a.date || ""
    }))
  };
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS") return reply(204, {});
  if(event.httpMethod !== "GET") return reply(405, { error: "Method not allowed." });

  const q = event.queryStringParameters || {};
  const awb = (q.awb || "").trim();
  const orderId = (q.order_id || "").trim();
  if(!awb && !orderId) return reply(400, { error: "Enter a tracking number." });

  // Keep the lookup key clean before it goes into a URL.
  if(awb && !/^[A-Za-z0-9_-]{4,40}$/.test(awb)){
    return reply(400, { error: "That doesn't look like a valid tracking number." });
  }

  try{
    const path = awb
      ? `/courier/track/awb/${encodeURIComponent(awb)}`
      : `/courier/track?order_id=${encodeURIComponent(orderId)}${
          process.env.SHIPROCKET_CHANNEL_ID ? "&channel_id=" + process.env.SHIPROCKET_CHANNEL_ID : ""}`;

    const res = await shiprocket(path, { method: "GET" });
    if(!res.ok){
      console.error("Shiprocket track failed:", res.status, res.data);
      return reply(404, { error: "We couldn't find that tracking number yet." });
    }

    const out = normalise(Array.isArray(res.data) ? res.data[0] : res.data);
    if(!out.awb && !out.scans.length && out.status === "In transit"){
      return reply(404, { error: "No tracking information yet. Please check back a little later." });
    }
    return reply(200, out);
  }catch(err){
    console.error("track-order error:", err);
    return reply(500, { error: "Tracking is temporarily unavailable." });
  }
};
