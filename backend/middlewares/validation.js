const Joi = require('joi');

// Skema Validasi untuk Transaksi (Tambah & Edit)
const transactionSchema = Joi.object({
    category_id: Joi.number().integer().required().messages({
        'any.required': 'Kategori wajib dipilih',
        'number.base': 'ID Kategori harus berupa angka'
    }),
    date: Joi.date().max('now').required().messages({
        'date.max': 'Tanggal transaksi tidak boleh melebihi hari ini!', // Joi otomatis handle tanggal masa depan
        'any.required': 'Tanggal transaksi wajib diisi'
    }),
    type: Joi.string().valid('pemasukan', 'pengeluaran').required().messages({
        'any.only': 'Tipe transaksi harus pemasukan atau pengeluaran',
        'any.required': 'Tipe transaksi wajib diisi'
    }),
    amount: Joi.number().positive().required().messages({
        'number.positive': 'Nominal transaksi harus lebih besar dari 0!', // Joi otomatis handle nominal minus
        'number.base': 'Nominal harus berupa angka',
        'any.required': 'Nominal wajib diisi'
    }),
    note: Joi.string().allow('', null).optional(),
    payment_method: Joi.string().allow('', null).optional(),
    sales_channel: Joi.string().allow('', null).optional()
});

// Middleware untuk memvalidasi request body
const validateTransaction = (req, res, next) => {
    // abortEarly: false -> agar Joi mengembalikan semua error jika ada lebih dari satu
    const { error } = transactionSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
        // Ambil pesan error pertama
        return res.status(400).json({ message: error.details[0].message });
    }
    
    next(); // Lanjut ke Controller jika lolos validasi
};

module.exports = { validateTransaction };