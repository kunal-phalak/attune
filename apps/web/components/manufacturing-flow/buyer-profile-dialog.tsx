'use client';

import type { BuyerCommerceProfile } from '@attune/domain';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import { Switch } from '@cloudflare/kumo/components/switch';
import { XIcon } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';

interface ProfileEnvelope {
  readonly profile: BuyerCommerceProfile | null;
}

function isProfileEnvelope(value: unknown): value is ProfileEnvelope {
  return typeof value === 'object' && value !== null && 'profile' in value;
}

async function profileResponse(response: Response): Promise<ProfileEnvelope> {
  const payload: unknown = await response.json();
  if (response.ok && isProfileEnvelope(payload)) return payload;
  const error = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : null;
  const message = typeof error === 'object' && error !== null ? Reflect.get(error, 'message') : null;
  throw new Error(typeof message === 'string' ? message : 'Buyer details could not be saved.');
}

const emptyAddress = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  provinceCode: '',
  countryCode: 'IN',
  postalCode: '',
  phone: '',
};

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  shippingAddress: emptyAddress,
  billingSameAsShipping: true,
  billingAddress: emptyAddress,
};

type BuyerForm = typeof emptyForm;
type AddressKey = keyof BuyerForm['shippingAddress'];

function formFromProfile(profile: BuyerCommerceProfile | null): BuyerForm {
  if (!profile) return emptyForm;
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone ?? '',
    shippingAddress: { ...emptyAddress, ...profile.shippingAddress },
    billingSameAsShipping: profile.billingSameAsShipping,
    billingAddress: { ...emptyAddress, ...(profile.billingAddress ?? {}) },
  };
}

function AddressFields({
  prefix,
  address,
  onChange,
}: {
  readonly prefix: string;
  readonly address: BuyerForm['shippingAddress'];
  readonly onChange: (key: AddressKey, value: string) => void;
}) {
  return (
    <div className="buyer-profile-fields buyer-profile-address">
      {(
        [
          ['firstName', 'First name', true],
          ['lastName', 'Last name', true],
          ['company', 'Company', false],
          ['address1', 'Address line 1', true],
          ['address2', 'Address line 2', false],
          ['city', 'City', true],
          ['provinceCode', 'State / province code', false],
          ['countryCode', 'Country code', true],
          ['postalCode', 'Postal code', true],
          ['phone', 'Phone', false],
        ] as const
      ).map(([key, label, required]) => (
        <label key={key} className="buyer-profile-field" htmlFor={`${prefix}-${key}`}>
          <span>{label}</span>
          <Input
            id={`${prefix}-${key}`}
            value={address[key]}
            required={required}
            autoComplete={
              key === 'postalCode'
                ? 'postal-code'
                : key === 'countryCode'
                  ? 'country'
                  : key
            }
            onChange={(event) => onChange(key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

export function BuyerProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (profile: BuyerCommerceProfile) => void | Promise<void>;
}) {
  const [form, setForm] = useState<BuyerForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch('/api/attune/commerce-profile', { cache: 'no-store' })
      .then(profileResponse)
      .then(({ profile }) => {
        if (active) setForm(formFromProfile(profile));
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Buyer details unavailable.');
      });
    return () => {
      active = false;
    };
  }, [open]);

  const addressChange = (
    target: 'shippingAddress' | 'billingAddress',
    key: AddressKey,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [target]: { ...current[target], [key]: value },
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { profile } = await profileResponse(
        await fetch('/api/attune/commerce-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }),
      );
      if (!profile) throw new Error('Buyer details were not returned after saving.');
      await onSaved(profile);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Buyer details could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="buyer-profile-dialog">
        <header className="buyer-profile-header">
          <div>
            <span className="manufacturing-eyebrow">Settings · Profile · Shipping &amp; billing</span>
            <Dialog.Title>Complete buyer details</Dialog.Title>
            <Dialog.Description>
              These details are needed so the maker can prepare your Shopify customer and delivery
              information.
            </Dialog.Description>
          </div>
          <Dialog.Close
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                shape="square"
                icon={<XIcon size={17} />}
                aria-label="Close buyer details"
              />
            }
          />
        </header>
        <form className="buyer-profile-form" onSubmit={(event) => void submit(event)}>
          <div className="buyer-profile-fields">
            <label className="buyer-profile-field" htmlFor="buyer-first-name">
              <span>First name</span>
              <Input
                id="buyer-first-name"
                autoComplete="given-name"
                required
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, firstName: event.target.value }))
                }
              />
            </label>
            <label className="buyer-profile-field" htmlFor="buyer-last-name">
              <span>Last name</span>
              <Input
                id="buyer-last-name"
                autoComplete="family-name"
                required
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lastName: event.target.value }))
                }
              />
            </label>
            <label className="buyer-profile-field" htmlFor="buyer-email">
              <span>Email</span>
              <Input
                id="buyer-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label className="buyer-profile-field" htmlFor="buyer-phone">
              <span>Phone</span>
              <Input
                id="buyer-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </label>
          </div>
          <section className="buyer-profile-section">
            <h3>Shipping address</h3>
            <AddressFields
              prefix="shipping"
              address={form.shippingAddress}
              onChange={(key, value) => addressChange('shippingAddress', key, value)}
            />
          </section>
          <Switch
            size="base"
            label="Billing address is the same as shipping"
            checked={form.billingSameAsShipping}
            onCheckedChange={(billingSameAsShipping) =>
              setForm((current) => ({ ...current, billingSameAsShipping }))
            }
          />
          {!form.billingSameAsShipping ? (
            <section className="buyer-profile-section">
              <h3>Billing address</h3>
              <AddressFields
                prefix="billing"
                address={form.billingAddress}
                onChange={(key, value) => addressChange('billingAddress', key, value)}
              />
            </section>
          ) : null}
          {error ? <p className="buyer-profile-error" role="alert">{error}</p> : null}
          <footer className="buyer-profile-actions">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              Save and continue
            </Button>
          </footer>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
