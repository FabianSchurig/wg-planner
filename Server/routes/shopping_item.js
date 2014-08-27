var async = require('async');

/*
 * Router for displaying a single shopping item
 *
 * Parameter:
 * - id int: ID of the displayed shopping item
 *
 * Requirements:
 * - loggedIn
 * - shopping item must exist
 * - Protagonist must be member of the household belonging
 *   to the shopping list belonging to the shopping item
 */
exports.shoppingItem = function(req, res) {
	if(req.session.loggedIn) {
		
		req.checkParams('id').isInt();
		
		var errors = req.validationErrors();
		
		if(errors) {
			res.redirect('/internal_error');
			return;
		}
		
		var form = {
			id : req.sanitize('id').toInt()
		};
		
		req.getDb(function(err, client, done) {
			if(err) {
				return console.error('Failed to connect in shoppingItem', err);
			}
			
			async.series({
				item : client.query.bind(client, 'SELECT i.id AS id, i.name AS name, i.owner_person_id AS owner, i.price AS price, ' +
					'm.role IS NOT NULL AS is_member, l.id AS shopping_list_id, l.household_id AS household_id ' +
					'FROM shopping_item i LEFT JOIN shopping_list l ON (i.shopping_list_id=l.id) ' +
					'LEFT JOIN household_member m ON (l.household_id=m.household_id AND m.person_id=$1) ' +
					'WHERE i.id=$2', [req.session.personId, form.id]),
				members : client.query.bind(client, 'SELECT p.id AS id, p.name AS name ' +
					'FROM shopping_item i JOIN shopping_list l ON (i.shopping_list_id=l.id) ' +
					'JOIN household_member m ON (l.household_id=m.household_id) ' +
					'JOIN person p ON (p.id=m.person_id) WHERE i.id=$1',
					[form.id])
			}, function(err, result) {
			
				done();
			
				if(err) {
					return console.error('Failed to load shopping item data', err);
				}
				
				if(result.item.rows.length !== 1) {
					res.redirect('/internal_error?item_not_found');
					return;
				}
				
				if(!result.item.rows[0].is_member) {
					res.redirect('/internal_error?not_member');
					return;
				}
				
				var item = result.item.rows[0];
				
				res.render('shopping_item', {
					_csrf : req.csrfToken(),
					item : item,
					members : result.members.rows,
					breadcrumbs : [
						{url: '/household/' + item.household_id, text: 'Haushalt'},
						{url: '/shopping_list/' + item.shopping_list_id, text: 'Einkaufsliste'},
						{url: '/shopping_item/' + item.id, text: 'Einkaufsartikel'}
					]
				});
			});	
		});
	
	} else {
		res.redirect('/sid_wrong');
	}
};

/*
 * Router for creating shopping items.
 *
 * Parameter: 
 * - shopping_list int: ID of the shopping list that will be parent of the new shopping item
 * - name string: name of the item
 * - owner int: ID of the person who want to have this item
 * - price float: price in Euro of the item (using '.' as decimal separator)
 *
 * Requirements:
 * - loggedIn
 * - Protagonist and owner must be member of the household belonging to the shopping list
 */
exports.shoppingItemCreate = function(req, res) {
	if(req.session.loggedIn) {
	
		req.checkBody('shopping_list').isInt();
		req.checkBody('name').isLength(1, 50);
		req.checkBody('owner').isInt();
		req.checkBody('price').isFloat();
	
		var errors = req.validationErrors();
	
		if(errors) {
			res.redirect('/internal_error');
			return;
		}
		
		req.sanitize('shopping_list').toInt();
		req.sanitize('name').toString();
		req.sanitize('owner').toInt();
		req.sanitize('price').toFloat();
	
		var form = {
			shoppingList : req.body.shopping_list,
			name : req.body.name,
			owner : req.body.owner,
			price : Math.round(req.body.price * 100)
		};
	
		req.getDb(function(err, client, done) {
			if(err) {
				return console.error('Failed to connect in shopping_item.shoppingItemCreate');
			}
			
			client.query(
				'SELECT EXISTS(SELECT 1 ' +
				'FROM shopping_list l ' +
				'JOIN household_member m ON (m.household_id=l.household_id) ' +
				'WHERE l.id=$1 AND m.person_id=$2 LIMIT 1) AS is_member, ' +
				'EXISTS (SELECT 1 ' +
				'FROM shopping_list l '+
				'JOIN household_member m ON (m.household_id=l.household_id) ' +
				'WHERE l.id=$1 AND m.person_id=$3 LIMIT 1) AS owner_is_member',
				[form.shoppingList, req.session.personId, form.owner],
				function(err, result) {
				
				if(err) {
					return console.error('Could not load membership information', err);
				}
				
				if(result.rows[0].is_member == false) {
					res.redirect('/internal_error?not_member');
					return;
				}
				
				if(result.rows[0].owner_is_member == false) {
					res.redirect('/internal_error?owner_not_member');
					return;
				}
				
				client.query('INSERT INTO shopping_item (name, shopping_list_id, owner_person_id, price) VALUES ($1,$2,$3,$4)',
					[form.name, form.shoppingList, form.owner, form.price],
					function(err, result) {
				
					done();
				
					if(err) {
						return console.error('Could not insert new shopping item', err);
					}
					
					res.redirect('/shopping_list/' + form.shoppingList);
				});
			});
		});
	} else {
		res.redirect('/sid_wrong');
	}
};