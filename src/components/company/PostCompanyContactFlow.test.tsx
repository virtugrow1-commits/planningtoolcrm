import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PostCompanyContactFlow from './PostCompanyContactFlow';

const addContactMock = vi.fn();
const navigateMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/contexts/ContactsContext', () => ({
  useContactsContext: () => ({ addContact: addContactMock }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const renderFlow = (company: { id: string; name: string } | null, onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <PostCompanyContactFlow company={company} onClose={onClose} />
    </MemoryRouter>
  );

/**
 * The form labels in PostCompanyContactFlow aren't associated via htmlFor,
 * so we locate inputs by walking from the visible <label> text to its sibling input.
 */
const inputForLabel = (labelText: RegExp): HTMLInputElement => {
  const label = screen.getAllByText(labelText).find((el) => el.tagName === 'LABEL');
  if (!label) throw new Error(`Label not found: ${labelText}`);
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`Input not found for label: ${labelText}`);
  return input as HTMLInputElement;
};

describe('PostCompanyContactFlow', () => {
  beforeEach(() => {
    addContactMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
    toastMock.mockReset();
  });

  it('renders nothing when no company is provided (e.g. on edit)', () => {
    const { container } = renderFlow(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows step 1 ask dialog with the company name', () => {
    renderFlow({ id: 'c1', name: 'Acme BV' });
    expect(screen.getByText('Contactpersoon toevoegen?')).toBeInTheDocument();
    expect(screen.getByText('Acme BV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ja, contact toevoegen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nee, sluiten/i })).toBeInTheDocument();
  });

  it('closes via "Nee, sluiten" without opening the form', async () => {
    const onClose = vi.fn();
    renderFlow({ id: 'c1', name: 'Acme BV' }, onClose);
    await userEvent.click(screen.getByRole('button', { name: /Nee, sluiten/i }));
    expect(onClose).toHaveBeenCalled();
    expect(addContactMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('completes the full happy-path flow: ask → form → another → done', async () => {
    const onClose = vi.fn();
    renderFlow({ id: 'c1', name: 'Acme BV' }, onClose);

    await userEvent.click(screen.getByRole('button', { name: /Ja, contact toevoegen/i }));
    await screen.findByText('Contactpersoon toevoegen');

    await userEvent.type(inputForLabel(/^Voornaam/i), 'Jan');
    await userEvent.type(inputForLabel(/^Achternaam/i), 'Jansen');
    await userEvent.type(inputForLabel(/^Functie$/i), 'CEO');
    await userEvent.type(inputForLabel(/^Email$/i), 'jan@acme.nl');
    await userEvent.type(inputForLabel(/^Telefoon$/i), '0612345678');

    await userEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }));

    await waitFor(() => expect(addContactMock).toHaveBeenCalledTimes(1));
    expect(addContactMock).toHaveBeenCalledWith(expect.objectContaining({
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@acme.nl',
      phone: '0612345678',
      jobTitle: 'CEO',
      company: 'Acme BV',
      companyId: 'c1',
      status: 'lead',
    }));

    expect(await screen.findByText('Nog een contactpersoon toevoegen?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nee, klaar/i }));
    expect(onClose).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('validates required first/last name and does not call addContact', async () => {
    renderFlow({ id: 'c1', name: 'Acme BV' });
    await userEvent.click(screen.getByRole('button', { name: /Ja, contact toevoegen/i }));
    await screen.findByText('Contactpersoon toevoegen');
    await userEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }));
    expect(addContactMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('"Ja, nog één" reopens the form with empty fields', async () => {
    renderFlow({ id: 'c1', name: 'Acme BV' });
    await userEvent.click(screen.getByRole('button', { name: /Ja, contact toevoegen/i }));
    await screen.findByText('Contactpersoon toevoegen');
    await userEvent.type(inputForLabel(/^Voornaam/i), 'Jan');
    await userEvent.type(inputForLabel(/^Achternaam/i), 'Jansen');
    await userEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }));

    await screen.findByText('Nog een contactpersoon toevoegen?');
    await userEvent.click(screen.getByRole('button', { name: /Ja, nog één/i }));

    await screen.findByText('Contactpersoon toevoegen');
    expect(inputForLabel(/^Voornaam/i).value).toBe('');
    expect(inputForLabel(/^Achternaam/i).value).toBe('');
  });

  it('"Naar bedrijfspagina" navigates to the company detail page', async () => {
    const onClose = vi.fn();
    renderFlow({ id: 'c1', name: 'Acme BV' }, onClose);
    await userEvent.click(screen.getByRole('button', { name: /Ja, contact toevoegen/i }));
    await screen.findByText('Contactpersoon toevoegen');
    await userEvent.type(inputForLabel(/^Voornaam/i), 'Jan');
    await userEvent.type(inputForLabel(/^Achternaam/i), 'Jansen');
    await userEvent.click(screen.getByRole('button', { name: /^Opslaan$/i }));

    await screen.findByText('Nog een contactpersoon toevoegen?');
    await userEvent.click(screen.getByRole('button', { name: /Naar bedrijfspagina/i }));
    expect(onClose).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/companies/c1');
  });
});
