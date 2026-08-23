import { useCallback, useRef } from "react";

const SDK = "https://checkout.razorpay.com/v1/checkout.js";

/* Loads Razorpay's checkout script once, on demand. Loading it lazily keeps
   ~80KB of third-party JS off the initial page for the majority of visitors who
   never reach checkout. */
export function useRazorpay() {
  const loaderRef = useRef(null);

  return useCallback(() => {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);

    // Cache the promise, not just the tag: two rapid clicks must await the same
    // load rather than injecting a second script.
    if (!loaderRef.current) {
      loaderRef.current = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SDK;
        s.async = true;
        s.onload = () =>
          window.Razorpay
            ? resolve(window.Razorpay)
            : reject(new Error("Payment gateway failed to initialise."));
        s.onerror = () => {
          loaderRef.current = null;   // let a later attempt retry
          reject(new Error("Couldn't reach the payment gateway. Check your connection."));
        };
        document.head.appendChild(s);
      });
    }
    return loaderRef.current;
  }, []);
}
