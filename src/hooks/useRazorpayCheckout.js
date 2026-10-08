const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the Razorpay checkout. Please try again."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Opens the Razorpay 2.0 checkout modal and resolves with the verified payment
 * response ({razorpay_order_id, razorpay_payment_id, razorpay_signature}) or
 * rejects with {code: 'payment_cancelled' | 'payment_failed' | 'network_error'}.
 *
 * TEST MODE (mode === "test"): no modal — simulates a successful payment after
 * a short delay so the whole flow can be exercised before live keys exist. The
 * production path (real Razorpay modal) is untouched.
 */
export function useRazorpayCheckout() {
  const openCheckout = async ({ key, orderId, amount, currency = "INR", name, description, prefill, mode }) => {
    if (mode === "test") {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return {
        razorpay_order_id: orderId,
        razorpay_payment_id: `pay_test_${Date.now()}`,
        razorpay_signature: "test_signature",
      };
    }

    try {
      await loadScript();
    } catch (e) {
      throw Object.assign(e, { code: "network_error" });
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      try {
        const rzp = new window.Razorpay({
          key,
          amount: Math.round(Number(amount) * 100),
          currency,
          name: name || "Lane Driving School",
          description: description || "Learner course",
          image: "/LANE_LOGO.svg",
          order_id: orderId,
          prefill: {
            name: prefill?.name || "",
            email: prefill?.email || "",
            contact: prefill?.phone || "",
          },
          modal: {
            ondismiss: () =>
              settle(
                reject,
                Object.assign(new Error("Payment window was closed."), { code: "payment_cancelled" }),
              ),
          },
          handler: (response) => settle(resolve, response),
          theme: { color: "#25D366" },
        });

        rzp.on("payment.failed", (resp) => {
          settle(
            reject,
            Object.assign(new Error(resp?.error?.description || "Payment failed. Please try again."), {
              code: "payment_failed",
            }),
          );
        });

        rzp.open();
      } catch (e) {
        settle(reject, Object.assign(e, { code: "network_error" }));
      }
    });
  };

  return { openCheckout };
}