import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { saveDocument, discardDocument } from '@/lib/extraction';
import { matchDocumentToContract } from '@/lib/contracts';
import { generateInsightsForContract, generateInsightsForBill } from '@/lib/insights';
import { saveBill } from '@/lib/bills';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DocumentTypeSelector } from '@/components/documents/DocumentTypeSelector';
import { BillCategorySelector } from '@/components/bills/BillCategorySelector';
import { BillingPeriodSelector } from '@/components/bills/BillingPeriodSelector';
import type { DocumentType, ExtractedDocumentData, UploadedDocument } from '@/types/documents';
import type { Bill, BillCategory, BillingPeriod } from '@/types/bills';

interface Props {
  userId: string;
  documentPath: string;
  extracted: ExtractedDocumentData;
  onSaved: (doc: UploadedDocument) => void;
  onCancelled: () => void;
}

export function DocumentPreviewForm({ userId, documentPath, extracted, onSaved, onCancelled }: Props) {
  const [documentType, setDocumentType] = useState<DocumentType | null>(extracted.document_type);
  const [provider, setProvider] = useState(extracted.provider ?? '');
  const [date, setDate] = useState(extracted.date ?? '');
  const [amount, setAmount] = useState(extracted.amount !== null ? String(extracted.amount) : '');
  const [expiryDate, setExpiryDate] = useState(extracted.expiry_date ?? '');
  const [category, setCategory] = useState<BillCategory | null>(extracted.category ?? null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod | null>('monthly');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const handleConfirm = async () => {
    setAmountError(null);
    setError(null);

    let parsedAmount: number | null = null;
    if (amount.trim() !== '') {
      const parsed = Number(amount.replace(',', '.'));
      if (Number.isNaN(parsed)) {
        setAmountError('Enter a valid number.');
        return;
      }
      parsedAmount = parsed;
    }

    setSaving(true);
    try {
      const doc = await saveDocument({
        userId,
        documentPath,
        documentType,
        provider: provider.trim() || null,
        date: date.trim() || null,
        amount: parsedAmount,
        expiryDate: expiryDate.trim() || null,
        extracted,
      });

      try {
        let bill: Bill | null = null;
        if (
          (doc.document_type === 'invoice' || doc.document_type === 'insurance') &&
          category !== null &&
          doc.provider !== null &&
          doc.amount !== null
        ) {
          bill = await saveBill({
            userId,
            documentId: doc.id,
            provider: doc.provider,
            category,
            invoiceDate: doc.date,
            billingPeriod,
            amount: doc.amount,
          });
          const billInsights = await generateInsightsForBill({ userId, bill });
          console.log('bill saved:', bill, 'insights created:', billInsights.length);
        }

        const match = await matchDocumentToContract({
          userId,
          documentId: doc.id,
          documentType: doc.document_type,
          provider: doc.provider,
          amount: doc.amount,
          date: doc.date,
          expiryDate: doc.expiry_date,
        });
        if (match) {
          const insights = await generateInsightsForContract({
            userId,
            contract: match.contract,
            previousAmount: match.previousAmount,
            includePriceIncrease: !bill,
          });
          console.log('matched contract:', match.contract, 'previousAmount:', match.previousAmount, 'insights created:', insights.length);
        } else {
          console.log('matchDocumentToContract returned null (not eligible or no provider) for document_type:', doc.document_type, 'provider:', doc.provider);
        }
      } catch (matchError) {
        console.error('bills/matchDocumentToContract/generateInsights failed:', matchError);
        // matching/insight é best-effort — o documento já foi guardado com sucesso
      }

      onSaved(doc);
    } catch {
      setSaving(false);
      setError('Could not save this document. Please try again.');
    }
  };

  const handleCancel = async () => {
    setDiscarding(true);
    try {
      await discardDocument(documentPath);
    } catch {
      // best-effort — falha de limpeza não bloqueia o utilizador
    }
    onCancelled();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Review before saving</Text>
      <DocumentTypeSelector value={documentType} onChange={setDocumentType} />
      {documentType === 'invoice' || documentType === 'insurance' ? (
        <>
          <BillCategorySelector value={category} onChange={setCategory} />
          <BillingPeriodSelector value={billingPeriod} onChange={setBillingPeriod} />
        </>
      ) : null}
      <Input label="Provider" value={provider} onChangeText={setProvider} placeholder="e.g. EDP" />
      <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Input
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
        error={amountError ?? undefined}
      />
      <Input
        label="Expiry / renewal date"
        value={expiryDate}
        onChangeText={setExpiryDate}
        placeholder="YYYY-MM-DD"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button
          title="Cancel"
          variant="primary"
          loading={discarding}
          disabled={saving}
          onPress={handleCancel}
        />
        <Button
          title="Confirm"
          variant="accent"
          loading={saving}
          disabled={discarding}
          onPress={handleConfirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.white,
  },
  error: {
    fontFamily: fonts.body,
    color: colors.critical,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
