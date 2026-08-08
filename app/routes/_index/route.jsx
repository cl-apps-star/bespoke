import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A private commission desk for your studio</h1>
        <p className={styles.text}>
          Turn custom enquiries into documented, approved and paid orders —
          proposals, deposits, proofs and revisions, all in one place.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Commission enquiries</strong>. Capture project details,
            budget, materials and deadline in one structured form.
          </li>
          <li>
            <strong>Proposals & deposits</strong>. Send a proposal, collect
            a deposit through a real Shopify checkout.
          </li>
          <li>
            <strong>Proofs & revisions</strong>. Share proofs, track
            approvals and manage change requests before production begins.
          </li>
        </ul>
      </div>
    </div>
  );
}
